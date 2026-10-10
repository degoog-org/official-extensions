import { ChatRole } from "../providers/index.js";

const CHAT_ROLES = new Set(Object.values(ChatRole));
const FOLLOWUP_OPENER = "Summarise the search results.";

export const cleanChatMessages = (raw) => {
  const kept = raw
    .filter((m) => CHAT_ROLES.has(m?.role) && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  const firstTurn = kept.findIndex((m) => m.role !== ChatRole.System);
  if (firstTurn >= 0 && kept[firstTurn].role === ChatRole.Assistant) {
    kept.splice(firstTurn, 0, { role: ChatRole.User, content: FOLLOWUP_OPENER });
  }
  return kept;
};
