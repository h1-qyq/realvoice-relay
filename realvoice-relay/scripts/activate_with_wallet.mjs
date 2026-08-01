import { createHash } from "node:crypto";

import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";
import { wrapFetchWithPayment } from "@x402/fetch";


const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;


export function activationKey(agentId) {
  if (typeof agentId !== "string" || !AGENT_ID.test(agentId)) {
    throw new Error("agent_id_invalid");
  }
  return createHash("sha256").update(agentId, "utf8").digest("hex");
}


export function paymentIdentifierExtension(id) {
  if (!/^[0-9a-f]{64}$/.test(id)) {
    throw new Error("payment_identifier_invalid");
  }
  return {
    key: "payment-identifier",
    async enrichPaymentPayload(paymentPayload, paymentRequired) {
      const key = "payment-identifier";
      const declared = paymentPayload.extensions?.[key] ?? paymentRequired.extensions?.[key];
      if (!declared || typeof declared !== "object") {
        throw new Error("payment_identifier_not_declared");
      }
      const extensions = {
        ...(paymentPayload.extensions ?? {}),
        [key]: {
          ...declared,
          info: { ...(declared.info ?? {}) },
        },
      };
      return {
        ...paymentPayload,
        extensions: appendPaymentIdentifierToExtensions(
          extensions,
          id,
        ),
      };
    },
  };
}


export function exactActivationPolicy({
  expectedAmountAtomic = "10000",
  expectedNetwork,
  expectedPayTo,
}) {
  if (!/^\d+$/.test(expectedAmountAtomic) || BigInt(expectedAmountAtomic) <= 0n) {
    throw new Error("expected_amount_invalid");
  }
  if (typeof expectedNetwork !== "string" || !expectedNetwork.startsWith("eip155:")) {
    throw new Error("expected_network_invalid");
  }
  if (typeof expectedPayTo !== "string" || !EVM_ADDRESS.test(expectedPayTo)) {
    throw new Error("expected_pay_to_invalid");
  }
  const payTo = expectedPayTo.toLowerCase();
  return (_version, requirements) => requirements.filter(requirement =>
    requirement.scheme === "exact" &&
    requirement.amount === expectedAmountAtomic &&
    requirement.network === expectedNetwork &&
    typeof requirement.payTo === "string" &&
    requirement.payTo.toLowerCase() === payTo
  );
}


function safeEndpoint(value) {
  const endpoint = new URL(value);
  const local = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) {
    throw new Error("activation_endpoint_must_use_https");
  }
  return endpoint.toString();
}


async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`activation_response_invalid:${response.status}`);
  }
}


/**
 * Pay once with a host-provided EVM signer. The signer stays inside the host
 * wallet integration; this module never accepts or persists a private key.
 */
export async function activateRealVoice({
  endpoint,
  agentId,
  signer,
  expectedNetwork,
  expectedPayTo,
  expectedAmountAtomic = "10000",
  fetchImpl = fetch,
  paidFetchFactory = ({ fetchImpl: baseFetch, client }) =>
    wrapFetchWithPayment(baseFetch, client),
  registerScheme = (client, options) => registerExactEvmScheme(client, options),
}) {
  if (!signer || typeof signer !== "object") {
    throw new Error("wallet_signer_required");
  }
  const url = safeEndpoint(endpoint);
  const id = activationKey(agentId);
  const client = new x402Client();
  registerScheme(client, { signer });
  client.registerPolicy(exactActivationPolicy({
    expectedAmountAtomic,
    expectedNetwork,
    expectedPayTo,
  }));
  client.registerExtension(paymentIdentifierExtension(id));

  const paidFetch = paidFetchFactory({ client, fetchImpl });
  const response = await paidFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": id,
    },
    body: JSON.stringify({ agent_id: agentId }),
  });
  const body = await responseJson(response);
  if (!response.ok) {
    throw new Error(body.error || body.reason || `activation_failed:${response.status}`);
  }
  if (body.already_active && !body.receipt) {
    throw new Error("receipt_already_issued:restore_the_original_receipt");
  }
  if (body.active !== true || typeof body.receipt !== "string" || !body.receipt) {
    throw new Error("activation_receipt_missing");
  }
  return body;
}
