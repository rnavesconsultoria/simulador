import crypto from "node:crypto";

export function generateAppSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashAppSessionToken(token, secret) {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export function hashAccessCode(code, secret) {
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}
