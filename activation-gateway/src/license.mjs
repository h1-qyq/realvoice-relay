import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";


const SKILL_NAME = "realvoice-relay";


function requireAgentId(agentId) {
  if (typeof agentId !== "string" || agentId.trim().length < 3) {
    throw new TypeError("agent_id must be a non-empty stable identifier");
  }
  return agentId.trim();
}


function requireSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 16) {
    throw new TypeError("activation secret must contain at least 16 bytes");
  }
  return secret;
}


function sign(encodedPayload, secret) {
  return createHmac("sha256", requireSecret(secret))
    .update(encodedPayload, "utf8")
    .digest("base64url");
}


export function issueReceipt(agentId, secret) {
  const payload = {
    v: 1,
    skill: SKILL_NAME,
    agent_id: requireAgentId(agentId),
  };
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}


export function verifyReceipt(token, agentId, secret) {
  try {
    const expectedAgentId = requireAgentId(agentId);
    requireSecret(secret);
    if (typeof token !== "string") {
      return { valid: false, reason: "receipt_malformed" };
    }
    const parts = token.split(".");
    if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
      return { valid: false, reason: "receipt_malformed" };
    }
    const [encodedPayload, suppliedSignature] = parts;
    const expectedSignature = sign(encodedPayload, secret);
    const supplied = Buffer.from(suppliedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");
    if (
      supplied.length !== expected.length
      || !timingSafeEqual(supplied, expected)
    ) {
      return { valid: false, reason: "receipt_invalid" };
    }
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (payload.v !== 1 || payload.skill !== SKILL_NAME) {
      return { valid: false, reason: "receipt_scope_invalid" };
    }
    if (payload.agent_id !== expectedAgentId) {
      return { valid: false, reason: "agent_mismatch" };
    }
    return { valid: true, reason: "active", payload };
  } catch {
    return { valid: false, reason: "receipt_malformed" };
  }
}

