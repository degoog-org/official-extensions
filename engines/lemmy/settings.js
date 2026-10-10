export const SETTINGS_SCHEMA = [
  {
    key: "instanceUrl",
    label: "Instance URL",
    type: "url",
    placeholder: "https://lemmy.world",
    description: "Custom Lemmy instance to query. Leave blank to use lemmy.world",
    default: "https://lemmy.world",
  },
  {
    key: "searchType",
    label: "Search Type",
    type: "select",
    options: ["All", "Posts", "Comments", "Communities"],
    description: "Select what content to search across Lemmy.world",
    default: "All",
  },
  {
    key: "sort",
    label: "Sort",
    type: "select",
    options: ["New", "Hot", "Old", "TopDay", "TopWeek", "TopMonth", "TopYear", "TopAll", "MostComments", "NewComments", "TopHour", "TopSixHour", "TopTwelveHour", "TopThreeMonths", "TopSixMonths", "TopNineMonths", "Controversial", "Scaled"],
    description: "Select the sort order for the search results",
    default: "New",
  },
  {
    key: "showNSFW",
    label: "Show NSFW Content",
    type: "toggle",
    description: "Show NSFW content in the search results",
    default: false,
  },
];
