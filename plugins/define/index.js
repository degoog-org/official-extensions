const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";

const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const _extractWord = (args) => {
  const t = args.trim().replace(/\s+mean(s)?$/i, "").trim();
  return t || args.trim().split(/\s+/)[0] || "";
}

export default {
  isClientExposed: false,
  name: "Define",
  description: "Look up word definitions using the Free Dictionary API.",
  trigger: "define",
  aliases: ["def", "d", "meaning"],
  naturalLanguagePhrases: ["define", "what does", "meaning of", "what is the meaning of"],

  settingsSchema: [],

  async execute(args, context) {
    const fetchFn = context?.fetch || fetch;
    const word = _extractWord(args);
    if (!word) {
      return {
        title: "Define",
        html: `<div class="command-result"><p>{{ t:define-command.usage }}</p></div>`,
      };
    }
    try {
      const res = await fetchFn(`${API_BASE}/${encodeURIComponent(word)}`);
      if (!res.ok) {
        if (res.status === 404) {
          return {
            title: "Define",
            html: `<div class="command-result"><p>{{ t:define-command.notFoundBefore }} <strong>${_esc(word)}</strong>.</p></div>`,
          };
        }
        throw new Error(res.statusText);
      }
      const data = await res.json();
      const entry = Array.isArray(data) ? data[0] : data;
      if (!entry) {
        return {
          title: "Define",
          html: `<div class="command-result"><p>{{ t:define-command.notFoundBefore }} <strong>${_esc(word)}</strong>.</p></div>`,
        };
      }
      const wordTitle = _esc(entry.word || word);
      const phonetic = entry.phonetic || (entry.phonetics && entry.phonetics[0]?.text) || "";
      let html = `<div class="command-result define-result"><h3 class="define-word">${wordTitle}</h3>`;
      if (phonetic) html += `<p class="define-phonetic">${_esc(phonetic)}</p>`;
      const meanings = entry.meanings || [];
      for (const m of meanings.slice(0, 5)) {
        const pos = m.partOfSpeech ? `<span class="define-pos">${_esc(m.partOfSpeech)}</span>` : "";
        html += `<div class="define-meaning">${pos}<ul class="define-list">`;
        const defs = (m.definitions || []).slice(0, 3);
        for (const d of defs) {
          html += `<li>${_esc(d.definition || "")}`;
          if (d.example) html += ` <span class="define-example">&ldquo;${_esc(d.example)}&rdquo;</span>`;
          html += `</li>`;
        }
        html += `</ul></div>`;
      }
      html += `</div>`;
      return { title: `Define: ${wordTitle}`, html };
    } catch (err) {
      return {
        title: "Define",
        html: `<div class="command-result"><p>{{ t:define-command.fetchError }} ${_esc(String(err.message))}</p></div>`,
      };
    }
  },
};
