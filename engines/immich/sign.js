import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = randomBytes(32);

export const sign = (id) => createHmac("sha256", SECRET).update(id).digest("hex").slice(0, 32);

export const validSig = (id, sig) => {
  const want = Buffer.from(sign(id));
  const got = Buffer.from(String(sig ?? ""));
  return want.length === got.length && timingSafeEqual(want, got);
};
