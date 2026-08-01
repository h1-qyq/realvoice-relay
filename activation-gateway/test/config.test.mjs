import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULTS, loadConfig } from "../src/config.mjs";


test("activation price is exactly one cent", () => {
  assert.equal(DEFAULTS.price, "$0.01");
});

test("safe testnet defaults are used", () => {
  const config = loadConfig({
    PAY_TO_ADDRESS: "0x1111111111111111111111111111111111111111",
    ACTIVATION_SECRET: "a-secret-with-at-least-32-characters",
  });
  assert.equal(config.network, "eip155:84532");
  assert.equal(config.facilitatorUrl, "https://x402.org/facilitator");
  assert.equal(config.port, 4021);
});

test("missing receiver wallet fails closed", () => {
  assert.throws(
    () => loadConfig({ ACTIVATION_SECRET: "a-secret-with-at-least-32-characters" }),
    /PAY_TO_ADDRESS/,
  );
});

test("missing or weak signing secret fails closed", () => {
  assert.throws(
    () => loadConfig({ PAY_TO_ADDRESS: "0x1111111111111111111111111111111111111111" }),
    /ACTIVATION_SECRET/,
  );
  assert.throws(
    () => loadConfig({
      PAY_TO_ADDRESS: "0x1111111111111111111111111111111111111111",
      ACTIVATION_SECRET: "short",
    }),
    /32 bytes/,
  );
});

test("price cannot be changed by environment", () => {
  assert.throws(
    () => loadConfig({
      PAY_TO_ADDRESS: "0x1111111111111111111111111111111111111111",
      ACTIVATION_SECRET: "a-secret-with-at-least-32-characters",
      X402_PRICE_USD: "$0.02",
    }),
    /fixed at \$0\.01/,
  );
});

