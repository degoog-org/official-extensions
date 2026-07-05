export const wrapResponse = (text) => {
  const trimmed = String(text ?? "").trimStart();
  const isJson =
    trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith(")]}'");

  return new Response(String(text ?? ""), {
    status: 200,
    headers: {
      "Content-Type": isJson
        ? "application/json; charset=utf-8"
        : "text/html; charset=utf-8",
    },
  });
};
