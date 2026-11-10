import { HOISTED_FN } from "./const/search.js";

const OPENERS = "{[(";
const CLOSERS = "}])";
const QUOTES = "\"'";
const ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" };

const _skipString = (src, start) => {
  let i = start + 1;
  while (i < src.length && src[i] !== src[start]) i += src[i] === "\\" ? 2 : 1;
  return i;
};

const _unescape = (body) =>
  body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) =>
    esc.length > 1 ? String.fromCharCode(parseInt(esc.slice(1), 16)) : (ESCAPES[esc] ?? esc),
  );

export const findClosing = (src, openIndex) => {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    if (QUOTES.includes(ch)) i = _skipString(src, i);
    else if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch) && --depth === 0) return i;
  }
  return -1;
};

export const splitTopLevel = (src) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (QUOTES.includes(ch)) i = _skipString(src, i);
    else if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = src.slice(start).trim();
  if (last) parts.push(last);
  return parts;
};

export const readLiteral = (token) => {
  const raw = token.trim();
  if (raw.length < 2 || !QUOTES.includes(raw[0]) || raw.at(-1) !== raw[0]) return null;
  return _unescape(raw.slice(1, -1));
};

export const readObject = (token) => {
  const fields = new Map();
  const raw = token.trim();
  if (!raw.startsWith("{") || !raw.endsWith("}")) return fields;
  for (const entry of splitTopLevel(raw.slice(1, -1))) {
    const keyEnd = QUOTES.includes(entry[0]) ? _skipString(entry, 0) + 1 : entry.indexOf(":");
    if (keyEnd < 1 || entry[keyEnd] !== ":") continue;
    const key = readLiteral(entry.slice(0, keyEnd)) ?? entry.slice(0, keyEnd).trim();
    fields.set(key, entry.slice(keyEnd + 1).trim());
  }
  return fields;
};

export const readHoisted = (html, anchor) => {
  const hoisted = new Map();
  const fnStart = html.lastIndexOf(HOISTED_FN, anchor);
  if (fnStart < 0) return hoisted;
  const paramsStart = fnStart + HOISTED_FN.length;
  const paramsEnd = html.indexOf(")", paramsStart);
  if (paramsEnd < 0 || html[paramsEnd + 1] !== "{") return hoisted;
  const bodyEnd = findClosing(html, paramsEnd + 1);
  if (bodyEnd < anchor || html[bodyEnd + 1] !== "(") return hoisted;
  const argsEnd = findClosing(html, bodyEnd + 1);
  if (argsEnd < 0) return hoisted;
  const params = html.slice(paramsStart, paramsEnd).split(",");
  const args = splitTopLevel(html.slice(bodyEnd + 2, argsEnd));
  params.forEach((name, i) => {
    const value = args[i] === undefined ? null : readLiteral(args[i]);
    if (value !== null) hoisted.set(name.trim(), value);
  });
  return hoisted;
};
