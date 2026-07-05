export const tabSpell = (url, containerId) => {
  const params = { url };
  if (containerId) params.container = containerId;
  return params;
};
