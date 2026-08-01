import assert from "node:assert/strict";
import test from "node:test";

import { issueReceipt, verifyReceipt } from "../src/license.mjs";


test("permanent receipt validates for the bound agent", () => {
  const token = issueReceipt("agent-1", "a-secret-with-enough-entropy");
  const result = verifyReceipt(token, "agent-1", "a-secret-with-enough-entropy");
  assert.equal(result.valid, true);
  assert.equal(result.payload.skill, "realvoice-relay");
  assert.equal(result.payload.agent_id, "agent-1");
  assert.equal("exp" in result.payload, false);
});

test("receipt rejects a different agent", () => {
  const token = issueReceipt("agent-1", "a-secret-with-enough-entropy");
  const result = verifyReceipt(token, "agent-2", "a-secret-with-enough-entropy");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "agent_mismatch");
});

test("tampered permanent receipt is rejected", () => {
  const token = issueReceipt("agent-1", "a-secret-with-enough-entropy");
  const result = verifyReceipt(`${token}x`, "agent-1", "a-secret-with-enough-entropy");
  assert.equal(result.valid, false);
});

test("empty agent id or weak secret is rejected", () => {
  assert.throws(() => issueReceipt("", "a-secret-with-enough-entropy"), /agent_id/);
  assert.throws(() => issueReceipt("agent-1", "short"), /secret/);
});

