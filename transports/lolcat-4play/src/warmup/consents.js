export const CONSENTS = {
  google: {
    hosts: [],
    headings: ["before you continue"],
    texts: ["before you continue"],
    acceptSelectors: ['#L2AGLb', 'button[aria-label="Accept all" i]'],
    acceptText: ["accept all", "accept", "i agree", "agree", "allow all", "allow"],
    rejectText: ["reject all", "reject", "manage", "more options", "customise", "customize"],
  },
  bing: {
    hosts: [],
    headings: [],
    texts: [],
    acceptSelectors: ["#bnp_btn_accept"],
    acceptText: ["accept", "accept all"],
    rejectText: ["reject", "decline", "manage options", "customise", "customize"],
  },
  generic: {
    hosts: [],
    headings: [],
    texts: [],
    acceptSelectors: [],
    acceptText: [
      "accept all",
      "accept",
      "i agree",
      "agree",
      "allow all",
      "allow",
      "got it",
      "i accept",
      "ok",
    ],
    rejectText: [
      "reject all",
      "reject",
      "disagree",
      "decline",
      "manage",
      "more options",
      "customise",
      "customize",
      "settings",
    ],
  },
};

const unique = (values) => [...new Set(values)];

export const consentMatchers = () => {
  const engines = Object.values(CONSENTS);
  return {
    hosts: unique(engines.flatMap((e) => e.hosts)).map((h) => h.toLowerCase()),
    texts: unique(engines.flatMap((e) => [...e.headings, ...e.texts])).map((t) =>
      t.toLowerCase(),
    ),
    acceptSelectors: unique(engines.flatMap((e) => e.acceptSelectors)),
    acceptText: unique(engines.flatMap((e) => e.acceptText)).map((t) =>
      t.toLowerCase(),
    ),
    rejectText: unique(engines.flatMap((e) => e.rejectText)).map((t) =>
      t.toLowerCase(),
    ),
  };
};
