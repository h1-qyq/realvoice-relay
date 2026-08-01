import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
  paymentIdentifierResourceServerExtension,
} from "@x402/extensions/payment-identifier";
import express from "express";

import { createActivationStore } from "./activation-store.mjs";
import { loadConfig } from "./config.mjs";
import { issueReceipt, verifyReceipt } from "./license.mjs";


export function idempotencyKey(agentId) {
  return createHash("sha256").update(agentId, "utf8").digest("hex");
}


function validAgentId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value);
}


export function buildActivationRouteConfig(config) {
  return {
    "POST /activate": {
      accepts: [
        {
          scheme: "exact",
          price: config.price,
          network: config.network,
          payTo: config.payTo,
        },
      ],
      description:
        "Permanently activate RealVoice Relay for one agent with a one-time USDC payment.",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          input: { agent_id: "agent-demo-001" },
          inputSchema: {
            properties: {
              agent_id: {
                type: "string",
                description: "Stable agent identifier bound to the permanent activation receipt.",
                minLength: 3,
                maxLength: 128,
              },
            },
            required: ["agent_id"],
          },
          bodyType: "json",
          output: {
            example: {
              active: true,
              already_active: false,
              skill: "realvoice-relay",
              price_usd: "$0.01",
              receipt: "signed-permanent-activation-receipt",
            },
          },
        }),
        "payment-identifier": declarePaymentIdentifierExtension(true),
      },
    },
  };
}


function paymentIdentifierFromContext(context) {
  return extractAndValidatePaymentIdentifier(context.paymentPayload);
}


export async function validateActivationPayment(context) {
  const { id, validation } = paymentIdentifierFromContext(context);
  const adapter = context.transportContext?.adapter;
  const agentId = adapter?.getBody?.()?.agent_id;
  const header = adapter?.getHeader?.("idempotency-key");
  const expected = validAgentId(agentId) ? idempotencyKey(agentId) : null;

  if (!validation.valid || !id || !expected || header !== expected || id !== header) {
    return {
      abort: true,
      reason: "payment_identifier_mismatch",
      message: "Payment identifier must equal the Idempotency-Key for this agent.",
    };
  }
}


export async function finalizeActivationSettlement(context, pending, store) {
  const { id } = paymentIdentifierFromContext(context);
  if (!id) {
    return;
  }
  const activation = pending.get(id);
  pending.delete(id);
  if (context.result?.success && activation) {
    store.set(activation.agentId, activation.receipt);
  }
}


export async function discardPendingActivation(context, pending) {
  const { id } = paymentIdentifierFromContext(context);
  if (id) {
    pending.delete(id);
  }
}


export function createApp(config, store = createActivationStore(config.storePath)) {
  const app = express();
  const pendingActivations = new Map();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      skill: "realvoice-relay",
      price_usd: config.price,
      network: config.network,
      receiver_configured: true,
    });
  });

  app.post("/verify", (request, response) => {
    const { agent_id: agentId, receipt } = request.body || {};
    if (!validAgentId(agentId) || typeof receipt !== "string") {
      return response.status(400).json({ active: false, reason: "request_invalid" });
    }
    const result = verifyReceipt(receipt, agentId, config.activationSecret);
    return response.status(result.valid ? 200 : 403).json({
      active: result.valid,
      reason: result.reason,
    });
  });

  app.post("/activate", (request, response, next) => {
    const { agent_id: agentId } = request.body || {};
    if (!validAgentId(agentId)) {
      return response.status(400).json({ error: "agent_id_invalid" });
    }
    const suppliedKey = request.get("Idempotency-Key");
    if (suppliedKey !== idempotencyKey(agentId)) {
      return response.status(400).json({
        error: "idempotency_key_invalid",
        hint: "Use lowercase hex SHA-256 of agent_id.",
      });
    }
    const existing = store.get(agentId);
    if (existing) {
      return response.json({
        active: true,
        already_active: true,
        reason: "receipt_already_issued",
        hint: "Use the receipt saved from the original successful activation.",
      });
    }
    return next();
  });

  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });
  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.network, new ExactEvmScheme())
    .registerExtension(paymentIdentifierResourceServerExtension)
    .onBeforeVerify(validateActivationPayment)
    .onAfterSettle(context =>
      finalizeActivationSettlement(context, pendingActivations, store),
    )
    .onSettleFailure(context =>
      discardPendingActivation(context, pendingActivations),
    )
    .onVerifiedPaymentCanceled(context =>
      discardPendingActivation(context, pendingActivations),
    );

  app.use(
    paymentMiddleware(
      buildActivationRouteConfig(config),
      resourceServer,
    ),
  );

  app.post("/activate", (request, response) => {
    const agentId = request.body.agent_id;
    const receipt = issueReceipt(agentId, config.activationSecret);
    pendingActivations.set(idempotencyKey(agentId), { agentId, receipt });
    response.json({
      active: true,
      already_active: false,
      skill: "realvoice-relay",
      price_usd: config.price,
      receipt,
    });
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "internal_error" });
  });
  return app;
}


export function start(env = process.env) {
  const config = loadConfig(env);
  const app = createApp(config);
  return app.listen(config.port, () => {
    console.log(`RealVoice Relay activation gateway listening on :${config.port}`);
  });
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
