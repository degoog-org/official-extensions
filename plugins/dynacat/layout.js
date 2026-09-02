import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const DIR = join(process.cwd(), "data");
const FILE = join(DIR, "dynacat-dashboard.json");

const empty = () => ({ selected: "", pages: {} });

const save = async (all) => {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(all, null, 2), "utf-8");
};

export const readLayout = async () => {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf-8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.pages !== "object") {
      return empty();
    }
    return parsed;
  } catch {
    return empty();
  }
};

export const readSelectedPage = async () => {
  const all = await readLayout();
  return typeof all.selected === "string" ? all.selected : "";
};

export const readPageLayout = async (page) => {
  const all = await readLayout();
  const entry = all.pages[page];
  return {
    order: Array.isArray(entry?.order) ? entry.order.map(String) : [],
    hidden: Array.isArray(entry?.hidden) ? entry.hidden.map(String) : [],
    spans: entry?.spans && typeof entry.spans === "object" ? entry.spans : {},
  };
};

export const writeSelectedPage = async (page) => {
  const all = await readLayout();
  all.selected = String(page || "");
  await save(all);
};

export const writePageLayout = async (page, layout) => {
  const all = await readLayout();
  all.selected = page;
  all.pages[page] = {
    order: (layout.order || []).map(String),
    hidden: (layout.hidden || []).map(String),
    spans: Object.fromEntries(
      Object.entries(layout.spans || {}).map(([key, value]) => [
        key,
        Number(value) === 2 ? 2 : 1,
      ]),
    ),
  };
  await save(all);
  return all.pages[page];
};

export const applyLayout = (cards, layout) => {
  const position = new Map(layout.order.map((key, index) => [key, index]));
  const hidden = new Set(layout.hidden);
  return cards
    .map((card, index) => ({
      ...card,
      visible: !hidden.has(card.key),
      span: Number(layout.spans[card.key]) === 2 ? 2 : 1,
      sort: position.get(card.key) ?? layout.order.length + index,
    }))
    .sort((a, b) => a.sort - b.sort);
};
