const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export const SESSION_PREFIX = "degoog-";

const hash32 = (text) => {
  let acc = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    acc ^= text.charCodeAt(i);
    acc = Math.imul(acc, FNV_PRIME);
  }
  return (acc >>> 0).toString(16).padStart(8, "0");
};

export const BOOT_SESSION = `${SESSION_PREFIX}${hash32(`boot:${Date.now()}`)}`;

export const sessionTag = (seed) => {
  const text = typeof seed === "string" ? seed.trim() : "";
  return text ? `${SESSION_PREFIX}${hash32(text)}` : BOOT_SESSION;
};
