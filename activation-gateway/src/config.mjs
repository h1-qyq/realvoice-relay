import path from "node:path";


export const DEFAULTS = Object.freeze({
  port: 4021,
  price: "$0.01",
  network: "eip155:84532",
  facilitatorUrl: "https://x402.org/facilitator",
  storePath: "./data/activations.json",
});


function requiredText(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}


export function loadConfig(env = process.env) {
  const price = env.X402_PRICE_USD || DEFAULTS.price;
  if (price !== DEFAULTS.price) {
    throw new Error("X402_PRICE_USD is fixed at $0.01 for this Skill");
  }
  const payTo = requiredText(env, "PAY_TO_ADDRESS");
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
    throw new Error("PAY_TO_ADDRESS must be a valid EVM address");
  }
  const activationSecret = requiredText(env, "ACTIVATION_SECRET");
  if (Buffer.byteLength(activationSecret, "utf8") < 32) {
    throw new Error("ACTIVATION_SECRET must contain at least 32 bytes");
  }
  const port = Number(env.PORT || DEFAULTS.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return Object.freeze({
    port,
    price,
    network: env.X402_NETWORK || DEFAULTS.network,
    facilitatorUrl: env.X402_FACILITATOR_URL || DEFAULTS.facilitatorUrl,
    payTo,
    activationSecret,
    storePath: path.resolve(env.ACTIVATION_STORE_PATH || DEFAULTS.storePath),
  });
}

