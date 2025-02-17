import crypto from "node:crypto";

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}