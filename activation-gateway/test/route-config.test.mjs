import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivationRouteConfig,
  createApp,
  finalizeActivationSettlement,
  idempotencyKey,
  validateActivationPayment,
} from "../src/server.mjs";


test("activation route declares discoverable POST input and output", () => {
  const routes = buildActivationRouteConfig({
    network: "eip155:84532",
    payTo: "0x1111111111111111111111111111111111111111",
    price: "$0.01",
  });
  const route = routes["POST /activate"];
  const discovery = route.extensions.bazaar;

  assert.equal(discovery.info.input.type, "http");
  assert.equal(discovery.info.input.bodyType, "json");
  assert.equal(discovery.info.input.body.agent_id, "agent-demo-001");
  assert.deepEqual(discovery.schema.properties.input.properties.body.required, ["agent_id"]);
  assert.equal(discovery.info.output.example.skill, "realvoice-relay");
});

test("activation route requires the x402 payment identifier extension", () => {
  const routes = buildActivationRouteConfig({
    network: "eip155:84532",
    payTo: "0x1111111111111111111111111111111111111111",
    price: "$0.01",
  });
  const identifier = routes["POST /activate"].extensions["payment-identifier"];

  assert.equal(identifier.info.required, true);
  assert.equal(identifier.schema.properties.id.minLength, 16);
});

function paymentContext(agentId, paymentId = idempotencyKey(agentId), success = true) {
  return {
    paymentPayload: {
      extensions: {
        "payment-identifier": {
          info: { required: true, id: paymentId },
          schema: {},
        },
      },
    },
    transportContext: {
      adapter: {
        getBody: () => ({ agent_id: agentId }),
        getHeader: name => name.toLowerCase() === "idempotency-key" ? paymentId : undefined,
      },
    },
    result: { success },
  };
}

test("payment identifier is bound to the agent id and idempotency header", async () => {
  assert.equal(await validateActivationPayment(paymentContext("agent-123")), undefined);

  const mismatched = await validateActivationPayment(
    paymentContext("agent-123", "0123456789abcdef0123456789abcdef"),
  );
  assert.deepEqual(mismatched, {
    abort: true,
    reason: "payment_identifier_mismatch",
    message: "Payment identifier must equal the Idempotency-Key for this agent.",
  });
});

test("license is persisted only after successful settlement", async () => {
  const agentId = "agent-123";
  const paymentId = idempotencyKey(agentId);
  const pending = new Map([[paymentId, { agentId, receipt: "signed-receipt" }]]);
  const writes = [];
  const store = { set: (...args) => writes.push(args) };

  await finalizeActivationSettlement(paymentContext(agentId, paymentId, false), pending, store);
  assert.deepEqual(writes, []);
  assert.equal(pending.has(paymentId), false);

  pending.set(paymentId, { agentId, receipt: "signed-receipt" });
  await finalizeActivationSettlement(paymentContext(agentId, paymentId, true), pending, store);
  assert.deepEqual(writes, [[agentId, "signed-receipt"]]);
  assert.equal(pending.has(paymentId), false);
});

test("already-active lookup never discloses the permanent receipt", async () => {
  const config = {
    activationSecret: "a-secret-with-at-least-32-characters",
    facilitatorUrl: "https://x402.org/facilitator",
    network: "eip155:84532",
    payTo: "0x1111111111111111111111111111111111111111",
    price: "$0.01",
    storePath: "unused-in-test.json",
  };
  const store = {
    get: () => "private-permanent-receipt",
    set: () => {
      throw new Error("unexpected write");
    },
  };
  const server = createApp(config, store).listen(0);
  try {
    const address = server.address();
    const agentId = "agent-123";
    const response = await fetch(`http://127.0.0.1:${address.port}/activate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey(agentId),
      },
      body: JSON.stringify({ agent_id: agentId }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.active, true);
    assert.equal(payload.already_active, true);
    assert.equal("receipt" in payload, false);
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()),
    );
  }
});
