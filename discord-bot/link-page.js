// The page a friend opens from /link. One box takes either the address Riot's sign-in lands on
// (quick, works on a phone, good for today's shop) or an ssid cookie (set up once on a computer).
import {AUTH_LOGIN_URL, SHARDS} from "./riot.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);

export function linkPage({error = "", done = null, quick = false, owner = false, expired = false} = {}) {
  let body;
  if (expired) {
    body = `<div class="hero"><div class="mark muted">!</div><h1>This link expired</h1>
      <p>Links work once, for 10 minutes. Run <code>/link</code> in Discord to get a new one.</p></div>`;
  } else if (done) {
    const note = owner ? "This was a test: your own <code>/shop</code> still comes from the daily run. <code>/unlink</code> removes it."
      : quick ? "Use <code>/shop</code> in Discord to see it. When your shop resets, run <code>/link</code> again for the new one."
      : "You're all set: <code>/shop</code> shows your shop every day.";
    body = `<div class="hero"><div class="mark ok">✓</div><h1>You're linked</h1><p>${note}</p></div>
      <h2>Your shop today</h2>
      <div class="shop">${done.map(s => `<div class="skin" style="--tier:${esc(s.tier_color || "#8b8f98")}">
        ${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : `<div class="noimg"></div>`}
        <div class="name">${esc(s.name)}</div>${s.price ? `<div class="price">${s.price.toLocaleString("en-US")} VP</div>` : ""}
      </div>`).join("")}</div>
      <p class="fine center">You can close this page.</p>`;
  } else {
    body = `<div class="hero"><div class="mark">◆</div><h1>See your shop in Discord</h1>
      <p>Three quick steps. Works on your phone.</p></div>
    <ol class="steps">
      <li><span class="num">1</span><div>
        <b>Sign in</b>
        <a class="button" href="${esc(AUTH_LOGIN_URL)}" target="_blank" rel="noopener">Sign in with Riot ↗</a>
        <span class="fine">Tick "Stay signed in" and next time it's one tap.</span></div></li>
      <li><span class="num">2</span><div>
        <b>Copy the address</b>
        <span>You'll land on a playvalorant.com page. Copy the address from the address bar, then come back here.</span>
        <span class="urlbar">🔒 playvalorant.com/…#access_token=…</span></div></li>
      <li><span class="num">3</span><div>
        <b>Paste it here</b>
        ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
        <form method="post" id="form">
          <div class="row">
            <input name="login" id="login" required autocomplete="off" spellcheck="false" placeholder="https://playvalorant.com/…" aria-label="Address or ssid">
            <button type="button" class="ghost" id="paste" hidden>Paste</button>
          </div>
          <label class="region">Region
            <select name="shard">${Object.entries(SHARDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
          </label>
          <button id="go">Link</button>
        </form></div></li>
    </ol>
    <details>
      <summary>Don't want to do this every day? Set it up once on a computer</summary>
      <ol class="plain">
        <li>Sign in with the button above.</li>
        <li>On the page you land on, open DevTools: <b>F12</b>, or <b>⌥⌘I</b> on a Mac.</li>
        <li>Go to <b>Application</b> (Chrome or Edge) → <b>Cookies</b> → <code>https://auth.riotgames.com</code>.</li>
        <li>Copy the value next to <code>ssid</code> and paste it in step 3 instead of the address.</li>
      </ol>
    </details>
    <p class="fine">What you paste works like a login to your Riot account. It goes only to this bot and Riot,
      never through Discord. <code>/unlink</code> deletes it, and changing your Riot password ends it.</p>
    <script>
      const box = document.getElementById("login"), form = document.getElementById("form"), go = document.getElementById("go");
      const submit = () => { if (box.value.trim()) form.requestSubmit(); };
      form.addEventListener("submit", () => { go.disabled = true; go.textContent = "Linking…"; });
      box.addEventListener("paste", () => setTimeout(() => { if (box.value.includes("access_token=")) submit(); }));
      if (navigator.clipboard?.readText) {
        const paste = document.getElementById("paste");
        paste.hidden = false;
        paste.addEventListener("click", async () => {
          try { box.value = (await navigator.clipboard.readText()).trim(); } catch { box.focus(); return; }
          if (box.value.includes("access_token=")) submit();
        });
      }
    </script>`;
  }
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Link Riot account</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1l7 7-7 7-7-7z' fill='%23ff4655'/%3E%3C/svg%3E">
<style>
  :root { color-scheme: light dark; --bg: #eef0f3; --card: #fff; --fg: #15171c; --muted: #5d636e; --line: #dfe2e7;
    --field: #f6f7f9; --accent: #ff4655; --accent-fg: #fff; --ok: #16a34a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0f13; --card: #171a20; --fg: #eceef1; --muted: #9aa1ac;
    --line: #2a2f38; --field: #0f1216; --ok: #22c55e; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 480px; margin: 40px auto; padding: 28px 24px; background: var(--card); border-radius: 16px;
    box-shadow: 0 1px 2px #0000000d, 0 8px 24px #00000014; }
  @media (max-width: 520px) { main { margin: 0; min-height: 100vh; border-radius: 0; padding: 24px 16px; box-shadow: none; } }
  .hero { text-align: center; margin-bottom: 24px; }
  .mark { width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center;
    background: var(--accent); color: var(--accent-fg); font-size: 22px; font-weight: 700; }
  .mark.ok { background: var(--ok); } .mark.muted { background: var(--muted); }
  h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 6px; } h2 { font-size: 1rem; margin: 24px 0 12px; }
  p { margin: 0; color: var(--muted); } code { font-size: 0.9em; color: var(--fg); }
  .steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .steps > li { display: flex; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; }
  .steps > li > div { flex: 1; min-width: 0; display: grid; gap: 8px; color: var(--muted); }
  .steps b { color: var(--fg); }
  .num { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
    background: var(--field); border: 1px solid var(--line); font-weight: 700; font-size: 0.9rem; color: var(--fg); }
  .urlbar { padding: 8px 12px; border-radius: 999px; background: var(--field); border: 1px solid var(--line);
    font: 0.85rem ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .button, button { display: block; width: 100%; padding: 12px 18px; font: inherit; font-weight: 650; text-align: center;
    border: 0; border-radius: 10px; background: var(--accent); color: var(--accent-fg); text-decoration: none; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  button.ghost { width: auto; background: var(--field); color: var(--fg); border: 1px solid var(--line); }
  .row { display: flex; gap: 8px; }
  input, select { width: 100%; padding: 12px; font: inherit; color: var(--fg); background: var(--field);
    border: 1px solid var(--line); border-radius: 10px; }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .region { display: flex; align-items: center; gap: 10px; margin: 10px 0; font-size: 0.9rem; color: var(--muted); }
  .region select { width: auto; flex: 1; padding: 8px 10px; }
  .error { padding: 10px 12px; border-radius: 10px; background: #ff465518; color: var(--accent); font-weight: 600; }
  details { margin: 20px 0 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; }
  summary { cursor: pointer; font-weight: 600; } .plain { margin: 12px 0 0; padding-left: 20px; color: var(--muted); }
  .plain li { margin-bottom: 6px; } .plain b { color: var(--fg); }
  .fine { font-size: 0.85rem; color: var(--muted); } .center { text-align: center; margin-top: 20px; }
  .shop { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .skin { padding: 12px; border-radius: 12px; background: var(--field); border: 1px solid var(--line);
    border-top: 3px solid var(--tier); display: grid; gap: 4px; }
  .skin img, .noimg { width: 100%; height: 64px; object-fit: contain; }
  .name { font-weight: 600; font-size: 0.9rem; line-height: 1.3; } .price { font-size: 0.85rem; color: var(--muted); }
</style></head><body><main>${body}</main></body></html>`, {
    headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
  });
}
