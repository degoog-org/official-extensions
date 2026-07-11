let apps = [];

const _normalizeApps = (input) => {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const icon = typeof item.icon === "string" ? item.icon.trim() : "";
    if (!label || !url) continue;
    out.push({ label, icon, url });
  }
  return out;
};

const _json = (body, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

export default {
  isClientExposed: false,
  name: "Apps pocket",
  description:
    "Adds a Google-style apps grid next to the settings icon. Each app has a label, icon URL and link.",
  trigger: "apps",
  aliases: [],

  settingsSchema: [
    {
      key: "appsJson",
      label: "Apps",
      type: "list",
      addLabel: "+ Add app",
      description:
        "Label and URL are required. Icon accepts a full image URL, a dashboard-icons name (e.g. jotty), or a selfh.st name prefixed with sh- (e.g. sh-jotty); it falls back to the first letter of the label.",
      itemSchema: [
        { key: "label", label: "Label", type: "text", placeholder: "Gmail" },
        {
          key: "icon",
          label: "Icon URL or name",
          type: "text",
          placeholder: "jotty, sh-jotty, or https://.../icon.png",
        },
        {
          key: "url",
          label: "URL",
          type: "text",
          placeholder: "https://mail.google.com",
        },
      ],
    },
  ],

  configure(settings) {
    const raw =
      typeof settings?.appsJson === "string" ? settings.appsJson.trim() : "";
    if (!raw) {
      apps = [];
      return;
    }
    try {
      apps = _normalizeApps(JSON.parse(raw));
    } catch {
      apps = [];
    }
  },

  async execute() {
    const html = `<div class="apps-pocket-bang">Configure your apps in Settings → Plugins → Apps pocket.</div>`;
    return { title: "Apps", html };
  },

  routes: [
    {
      method: "get",
      path: "/apps",
      handler: async () => _json({ apps }),
    },
  ],
};
