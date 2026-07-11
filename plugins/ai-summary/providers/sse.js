export const readSse = async function* (body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let evt;
  let data = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line === "") {
          if (data.length > 0) {
            yield { event: evt, data: data.replace(/\n$/, "") };
            data = "";
            evt = undefined;
          }
          continue;
        }
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) {
          evt = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data += line.slice(5).replace(/^ /, "") + "\n";
        }
      }
    }
    if (data.length > 0) {
      yield { event: evt, data: data.replace(/\n$/, "") };
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
};
