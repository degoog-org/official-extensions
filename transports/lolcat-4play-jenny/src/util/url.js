export const originFor = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};
