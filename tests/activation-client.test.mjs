import assert from "node:assert/strict";
import test from "node:test";

import {
  activateRealVoice,
  activationKey,
  exactActivationPolicy,
  paymentIdentifierExtension,
} from "../realvoice-relay/scripts/activate_with_wallet.mjs";


test("activationKey is stable lowercase SHA-256 and validates agent ids", () => {
  assert.equal(
    activationKey("agent-demo-001"),
    "a6c07e36c5212ab1d2123ab50ff0d1ce9cc29ac36968128eb5e1cc7fe8d742a8",
  );
  assert.throws(() => activationKey("x"), /agent_id_invalid/);
});


test("payment identifier extension binds the signed payload to the agent", async () => {
  const id = activationKey("agent-demo-001");
  const extension = paymentIdentifierExtension(id);
  const enriched = await extension.enrichPaymentPayload(
    { x402Version: 2, payload: {}, extensions: {} },
    { extensions: { "payment-identifier": { info: { required: true } } } },
  );
  assert.equal(extension.key, "payment-identifier");
  assert.equal(enriched.extensions["payment-identifier"].info.id, id);
});


test("payment policy allows only the configured one-cent requirement", () => {
  const policy = exactActivationPolicy({
    expectedAmountAtomic: "10000",
    expectedNetwork: "eip155:8453",
    expectedPayTo: "0x1111111111111111111111111111111111111111",
  });
  const allowed = {
    scheme: "exact",
    amount: "10000",
    network: "eip155:8453",
    payTo: "0x1111111111111111111111111111111111111111",
  };
  assert.deepEqual(policy(2, [allowed]), [allowed]);
  assert.deepEqual(policy(2, [{ ...allowed, amount: "10001" }]), []);
  assert.deepEqual(policy(2, [{ ...allowed, payTo: "0x2222222222222222222222222222222222222222" }]), []);
  assert.deepEqual(policy(2, [{ ...allowed, network: "eip155:84532" }]), []);
});


test("activation sends the stable key and returns the first receipt", async () => {
  const calls = [];
  const paidFetchFactory = ({ client, fetchImpl }) => {
    assert.ok(client);
    return async (url, init) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    };
  };
  const fetchImpl = async () => new Response(JSON.stringify({
    active: true,
    already_active: false,
    receipt: "receipt-123",
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await activateRealVoice({
    endpoint: "https://pay.example.test/activate",
    agentId: "agent-demo-001",
    signer: { address: "0x1111111111111111111111111111111111111111" },
    expectedNetwork: "eip155:8453",
    expectedPayTo: "0x2222222222222222222222222222222222222222",
    fetchImpl,
    paidFetchFactory,
    registerScheme: () => {},
  });

  assert.equal(result.receipt, "receipt-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers["Idempotency-Key"], activationKey("agent-demo-001"));
  assert.deepEqual(JSON.parse(calls[0].init.body), { agent_id: "agent-demo-001" });
});


test("activation never claims success when an old receipt is not returned", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    active: true,
    already_active: true,
    reason: "receipt_already_issued",
  }), { status: 200, headers: { "content-type": "application/json" } });

  await assert.rejects(
    activateRealVoice({
      endpoint: "https://pay.example.test/activate",
      agentId: "agent-demo-001",
      signer: {},
      expectedNetwork: "eip155:8453",
      expectedPayTo: "0x2222222222222222222222222222222222222222",
      fetchImpl,
      paidFetchFactory: ({ fetchImpl: baseFetch }) => baseFetch,
      registerScheme: () => {},
    }),
    /receipt_already_issued/,
  );
});
