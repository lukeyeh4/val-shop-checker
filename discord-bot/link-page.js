// The page a friend opens from /link. One box takes either the address Riot's sign-in lands on
// (quick, works on a phone, good for today's shop) or an ssid cookie (set up once on a computer).
import {AUTH_LOGIN_URL, SHARDS} from "./riot.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);

export function linkPage({error = "", done = null, quick = false, expired = false} = {}) {
  let body;
  if (expired) {
    body = `<h1>Link expired</h1><p>This link was already used or is more than 10 minutes old. Run <code>/link</code> in Discord again.</p>`;
  } else if (done) {
    body = `<h1>Linked ✓</h1>
      <p>Your shop today: ${done.map(s => `<b>${esc(s.name)}</b>`).join(", ")}.</p>
      <p>${quick
        ? "Use <code>/shop</code> in Discord to see it. When the shop resets, run <code>/link</code> again to see the new one."
        : "You're set: <code>/shop</code> shows your shop every day."}</p>
      <p class="small">You can close this page.</p>`;
  } else {
    body = `<h1>See your shop in Discord</h1>
    <ol class="steps">
      <li><a class="button" href="${esc(AUTH_LOGIN_URL)}" target="_blank" rel="noopener">Sign in with Riot</a>
        <span class="small">Tick "Stay signed in" and next time it's one tap.</span></li>
      <li>You'll land on a playvalorant.com page. <b>Copy its address</b> from the address bar, then come back here.</li>
      <li>Paste it below and tap Link.</li>
    </ol>
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <form method="post">
      <input name="login" required autocomplete="off" spellcheck="false" placeholder="https://playvalorant.com/…" aria-label="Address or ssid">
      <label>Region <select name="shard">${Object.entries(SHARDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <button>Link</button>
    </form>
    <p class="small">This works for today's shop. To skip this every day, set it up once on a computer:</p>
    <details>
      <summary>Set it up once (computer, 2 minutes)</summary>
      <ol>
        <li>Sign in with the button above.</li>
        <li>On the page you land on, open DevTools: <b>F12</b>, or <b>⌥⌘I</b> on a Mac.</li>
        <li>Go to <b>Application</b> (Chrome or Edge) → <b>Cookies</b> → <code>https://auth.riotgames.com</code>.</li>
        <li>Copy the value next to <code>ssid</code> and paste it in the box above instead of the address.</li>
      </ol>
    </details>
    <p class="small">What you paste works like a login to your Riot account. It goes only to this bot and Riot,
      never through Discord. <code>/unlink</code> deletes it, and changing your Riot password ends it.</p>`;
  }
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Link Riot account</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f6f7; --fg: #1d1f23; --card: #fff; --muted: #5d636e; --accent: #ff4655; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111317; --fg: #eceef1; --card: #1b1e24; --muted: #a0a6b1; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.5 system-ui, sans-serif; }
  main { max-width: 520px; margin: 32px auto; padding: 24px; background: var(--card); border-radius: 12px; }
  @media (max-width: 600px) { main { margin: 0; min-height: 100vh; box-sizing: border-box; border-radius: 0; padding: 20px 16px; } }
  h1 { font-size: 1.5rem; margin-top: 0; } p, li { color: var(--muted); } b, code { color: var(--fg); }
  .steps li { margin-bottom: 14px; } .small { display: block; font-size: 0.88rem; color: var(--muted); }
  a { color: var(--accent); }
  .button, button { display: inline-block; margin: 4px 0; padding: 12px 22px; font: inherit; font-weight: 600; border: 0;
    border-radius: 10px; background: var(--accent); color: #fff; text-decoration: none; cursor: pointer; }
  input, select { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 12px; font: inherit;
    border: 1px solid #8886; border-radius: 10px; background: var(--bg); color: var(--fg); }
  label { display: block; margin: 12px 0; font-size: 0.9rem; color: var(--muted); }
  form button { width: 100%; }
  details { margin: 8px 0 16px; } summary { cursor: pointer; font-weight: 600; color: var(--fg); }
  .error { color: var(--accent); font-weight: 600; }
</style></head><body><main>${body}</main></body></html>`, {
    headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
  });
}
