import { buildBangUrl } from "./url.js";

let bangs = [];

const escHtml = (s) => {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const normalizeBangs = (input) => {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const shortcut = typeof item.shortcut === "string" ? item.shortcut.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!shortcut || !url) continue;
    out.push({
      name: typeof item.name === "string" ? item.name.trim() : "",
      shortcut,
      url,
      snapDomain: typeof item.snapDomain === "string" ? item.snapDomain.trim() : "",
      regex: typeof item.regex === "string" ? item.regex.trim() : "",
      naturalLanguage: String(item.naturalLanguage ?? "false") === "true",
      naturalLanguagePhrases:
        typeof item.naturalLanguagePhrases === "string"
          ? item.naturalLanguagePhrases.trim()
          : "",
      openSnap: String(item.openSnap ?? "false") === "true",
      openBase: String(item.openBase ?? "false") === "true",
      encodeQuery: String(item.encodeQuery ?? "true") === "true",
      spaceToPlus: String(item.spaceToPlus ?? "true") === "true",
    });
  }
  return out;
};

const _json = (body, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

const PLACEHOLDER_HELP =
  "Use {{{s}}} or %s in the URL template where the typed query should go.";

const HELP_HINT =
  "Type <code>!&lt;shortcut&gt; terms</code> (leading or trailing) to fire a bang.";

const helpScript = `
  (function(){
    var tabs=document.querySelectorAll('.help-tab');
    var panels=document.querySelectorAll('.help-panel');
    tabs.forEach(function(t){
      t.addEventListener('click',function(){
        tabs.forEach(function(x){x.classList.remove('active')});
        panels.forEach(function(x){x.classList.remove('active')});
        t.classList.add('active');
        var p=document.querySelector('[data-help-panel="'+t.dataset.helpCat+'"]');
        if(p)p.classList.add('active');
      });
    });
    var input=document.getElementById('help-search-input');
    if(input)input.addEventListener('input',function(){
      var q=input.value.toLowerCase().trim();
      var rows=document.querySelectorAll('.help-row');
      var counts={};
      rows.forEach(function(r){
        var match=!q||r.dataset.helpSearch.toLowerCase().includes(q);
        r.style.display=match?'':'none';
        var panel=r.closest('.help-panel');
        if(panel){
          var cat=panel.dataset.helpPanel;
          if(!counts[cat])counts[cat]=0;
          if(match)counts[cat]++;
        }
      });
      tabs.forEach(function(t){
        var cat=t.dataset.helpCat;
        var c=t.querySelector('.help-tab-count');
        if(c&&counts[cat]!==undefined)c.textContent=counts[cat];
      });
    });
  })();
`;

const helpRow = (bang) => {
  const example = buildBangUrl(bang, "query");
  const name = bang.name || bang.shortcut;
  const phrases = String(bang.naturalLanguagePhrases || "").trim();
  const phraseHtml =
    bang.naturalLanguage && phrases
      ? `<div class="help-row-desc">Phrases: ${escHtml(phrases)}</div>`
      : "";
  const searchData = `${bang.shortcut} ${name} ${bang.url} ${example} ${phrases}`;
  return `<div class="help-row" data-help-search="${escHtml(searchData)}">
    <div class="help-row-main">
      <span class="help-trigger">!${escHtml(bang.shortcut)}</span>
      <span class="help-name">${escHtml(name)}</span>
    </div>
    <div class="help-row-desc">${escHtml(example)}</div>
    ${phraseHtml}
  </div>`;
};

const buildHelp = (list) => {
  const cat = "Custom Bangs";
  const rows = list.map(helpRow).join("");
  const tabButtons = `<button class="help-tab active" data-help-cat="${cat}">${cat} <span class="help-tab-count">${list.length}</span></button>`;
  const panels = `<div class="help-panel active" data-help-panel="${cat}"><div class="help-panel-card">${rows}</div></div>`;
  return `<div class="command-result help-container">
    <div class="help-search-wrap degoog-search-bar degoog-search-bar--square-advanced"><i class="fa-solid fa-magnifying-glass search-icon"></i><input type="text" class="search-input" placeholder="Search bangs" id="help-search-input"></div>
    <div class="help-hint">${HELP_HINT}</div>
    <div class="help-layout"><div class="help-tabs">${tabButtons}</div><div class="help-panels">${panels}</div></div>
    <script>${helpScript}</script>
  </div>`;
};

export default {
  isClientExposed: false,
  name: "Custom Bangs",
  description:
    "Define your own bang shortcuts that redirect to any site, optionally injecting your query into a URL template. Type !<shortcut> terms (leading or trailing).",
  trigger: "custom-bangs",
  aliases: ["bangs", "cb"],

  settingsSchema: [
    {
      key: "intro",
      label: "How it works",
      type: "info",
      description:
        "Each bang has a shortcut (e.g. gh) and a URL template. " +
        PLACEHOLDER_HELP +
        " Then type `!gh degoog` or `degoog !gh` in the search bar.",
    },
    {
      key: "bangs",
      label: "Custom bangs",
      type: "list",
      addLabel: "+ Add bang",
      description:
        "Snap domain, regex and the toggles are optional. With no query, Open base path or Open snap domain control where a bare bang goes.",
      itemSchema: [
        { key: "name", label: "Bang name", type: "text", placeholder: "GitHub" },
        { key: "shortcut", label: "Shortcut", type: "text", placeholder: "gh" },
        {
          key: "url",
          label: "URL template",
          type: "text",
          placeholder: "https://github.com/search?q=%s",
        },
        {
          key: "snapDomain",
          label: "Domain for snaps",
          type: "text",
          placeholder: "github.com",
        },
        {
          key: "regex",
          label: "Regex to parse query terms",
          type: "text",
          placeholder: "",
        },
        {
          key: "naturalLanguage",
          label: "Natural language",
          type: "toggle",
          description:
            "When on, the phrases below can trigger this bang without typing !.",
        },
        {
          key: "naturalLanguagePhrases",
          label: "Natural language phrases",
          type: "text",
          placeholder: "github, search github, find repo",
          description:
            "Comma-separated phrases. Exact phrase or phrase plus trailing query terms will redirect through this bang.",
        },
        { key: "openSnap", label: "Open snap domain when no query", type: "toggle" },
        { key: "openBase", label: "Open base path when no query", type: "toggle" },
        {
          key: "encodeQuery",
          label: "URL encode query",
          type: "toggle",
          default: "true",
        },
        {
          key: "spaceToPlus",
          label: "Encode spaces as plus (+)",
          type: "toggle",
          default: "true",
        },
      ],
    },
  ],

  configure(settings) {
    const raw = typeof settings?.bangs === "string" ? settings.bangs.trim() : "";
    if (!raw) {
      bangs = [];
      return;
    }
    try {
      bangs = normalizeBangs(JSON.parse(raw));
    } catch {
      bangs = [];
    }
  },

  routes: [
    {
      method: "get",
      path: "/bangs",
      handler: async () => _json({ bangs }),
    },
  ],

  async execute() {
    if (!bangs.length) {
      return {
        title: "Custom Bangs",
        html: `<div class="command-result help-container">
          <div class="help-hint">No custom bangs yet. Add some in Settings, Plugins, Custom Bangs.</div>
          <div class="help-hint">${escHtml(PLACEHOLDER_HELP)}</div>
        </div>`,
      };
    }

    return {
      title: "Custom Bangs",
      html: buildHelp(bangs),
    };
  },
};
