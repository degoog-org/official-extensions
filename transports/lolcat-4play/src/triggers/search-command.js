export const runSearch = async (command, trigger, query, tabId) => {
  const res = await command("search_query", {
    alias: trigger,
    engine: trigger,
    text: query,
    tabid: tabId,
  });
  if (res?.status !== true) {
    throw new Error(
      `lolcat-4play: search trigger "${trigger}" failed: ${res?.error || "unknown error"}`,
    );
  }
  return res;
};
