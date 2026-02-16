import fetch from "node-fetch";

export async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "user-agent": "nekrolog-refresh-bot/1.0 (+https://github.com/)",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, error: null };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        text: "",
        error: String(error?.message || error)
      };
    }
  } finally {
    clearTimeout(t);
  }
}
