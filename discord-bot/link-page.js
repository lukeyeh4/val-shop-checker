// The page a friend opens from /link to save their Riot session for /shop.
import {AUTH_LOGIN_URL, SHARDS} from "./riot.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);

export function linkPage({error = "", done = null, expired = false} = {}) {
  let body;
  if (expired) {
    body = `<h1>Link expired</h1><p>This link was already used or is older than 10 minutes. Run <code>/link</code> in Discord again.</p>`;
  } else if (done) {
    body = `<h1>Linked ✓</h1><p>Your shop today: ${done.map(s => `<b>${esc(s.name)}</b>`).join(", ")}.</p>
      <p>Use <code>/shop</code> in Discord any time. <code>/unlink</code> deletes your saved login.</p>`;
  } else {
    body = `<h1>Link your Riot account</h1>
    <p>This lets <code>/shop</code> show <em>your</em> daily shop. It needs your Riot <code>ssid</code> cookie, which works
      like a saved login: whoever has it can use your Riot account. It's stored only for this bot.
      <code>/unlink</code> deletes it, and changing your Riot password ends it.</p>
    <ol>
      <li>On a computer, open <a href="${esc(AUTH_LOGIN_URL)}" target="_blank" rel="noopener">Riot's login page</a> and sign in.
        You'll land on a playvalorant.com page.</li>
      <li>Open DevTools (F12, or ⌥⌘I on a Mac) → <b>Application</b> (Chrome/Edge) or <b>Storage</b> (Firefox)
        → <b>Cookies</b> → <code>https://auth.riotgames.com</code>.</li>
      <li>Copy the value of <code>ssid</code> and paste it below.</li>
    </ol>
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <form method="post">
      <label>ssid <input name="ssid" type="password" required autocomplete="off" spellcheck="false"></label>
      <label>Region <select name="shard">${Object.entries(SHARDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <button>Link</button>
    </form>`;
  }
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Link Riot account</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f6f7; --fg: #1d1f23; --card: #fff; --muted: #5d636e; --accent: #ff4655; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111317; --fg: #eceef1; --card: #1b1e24; --muted: #a0a6b1; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 560px; margin: 32px auto; padding: 24px; background: var(--card); border-radius: 12px; }
  @media (max-width: 600px) { main { margin: 0; border-radius: 0; padding: 16px; } }
  h1 { font-size: 1.4rem; margin-top: 0; } p, li { color: var(--muted); } b, code { color: var(--fg); }
  a { color: var(--accent); } label { display: block; margin: 12px 0; font-weight: 600; }
  input, select { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px; font: inherit;
    border: 1px solid #8884; border-radius: 8px; background: var(--bg); color: var(--fg); }
  button { margin-top: 8px; padding: 10px 20px; font: inherit; font-weight: 600; border: 0; border-radius: 8px;
    background: var(--accent); color: #fff; cursor: pointer; }
  .error { color: var(--accent); font-weight: 600; }
</style></head><body><main>${body}</main></body></html>`, {
    headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
  });
}
