// Discord /wishlist command (Cloudflare Worker): show, add or remove wishlist.txt entries.
// Discord POSTs each command here; edits commit to the repo the same way the website's sync does,
// and that push rebuilds the site. Skin pictures and autocomplete come from the site's skins.json.

const API = "https://api.github.com/repos/";
const MEDIA = "https://media.valorant-api.com/";
const EPHEMERAL = 64;  // replies only you can see
const MAX_EMBEDS = 10;  // Discord's limit per message

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("val-shop wishlist bot");
    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) return new Response("bad signature", {status: 401});
    const interaction = JSON.parse(body);
    if (interaction.type === 1) return json({type: 1});  // Discord's endpoint check
    if (interaction.type !== 2 && interaction.type !== 4) return new Response("unhandled", {status: 400});

    const owner = (interaction.member || interaction).user.id === env.DISCORD_USER_ID;
    if (interaction.type === 4) {  // autocomplete while typing
      return json({type: 8, data: {choices: owner ? await suggest(interaction.data.options[0], env) : []}});
    }
    if (!owner) return json({type: 4, data: {content: "Only the wishlist owner can use this.", flags: EPHEMERAL}});
    // Discord wants an answer within 3s and GitHub can be slower: say "thinking…", then edit in the result.
    ctx.waitUntil(handle(interaction.data.options[0], env)
      .catch(e => ({content: `⚠️ ${e.message}`}))
      .then(reply => editReply(interaction, reply)));
    return json({type: 5, data: {flags: EPHEMERAL}});
  },
};

async function handle(sub, env, retry = true) {
  const skin = sub.options?.[0]?.value.trim();
  const [file, db] = await Promise.all([readWishlist(env), loadDb(env)]);
  const i = skin ? file.entries.findIndex(e => e.toLowerCase() === skin.toLowerCase()) : -1;
  let name;
  if (sub.name === "add") {
    if (i >= 0) return {content: `**${file.entries[i]}** is already on your wishlist.`, embeds: cards(db, [file.entries[i]], true)};
    file.entries.push(name = skin);
  } else if (sub.name === "remove") {
    if (i < 0) return show(file.entries, db, `**${skin}** isn't on your wishlist.`);
    name = file.entries.splice(i, 1)[0];
  } else {
    return show(file.entries, db);
  }
  try {
    await writeWishlist(env, file, `Update wishlist from Discord: ${sub.name} ${name}`);
  } catch (e) {
    if (retry && (e.status === 409 || e.status === 422)) return handle(sub, env, false);  // changed elsewhere: redo on the new file
    throw e;
  }
  return sub.name === "add"
    ? {content: `Added **${name}**.`, embeds: cards(db, [name], true)}
    : show(file.entries, db, `Removed **${name}**.`);
}

function show(entries, db, note = "") {
  if (!entries.length) return {content: `${note}\n\nYour wishlist is empty.`};
  const content = `${note}\n\n**Wishlist** (${entries.length})`;
  if (!db) return {content: content + "\n" + entries.map(e => `• ${e}`).join("\n")};
  const rest = entries.slice(MAX_EMBEDS);
  return {content: content + (rest.length ? `\nAlso: ${rest.join(", ")}` : ""), embeds: cards(db, entries.slice(0, MAX_EMBEDS))};
}

const cards = (db, entries, big = false) => db ? entries.map(e => card(e, db, big)) : [];

// One embed per wishlist entry: the skin it names (or the first of the skins a line like "Reaver" covers).
function card(entry, db, big) {
  const re = pattern(entry);
  const skins = db.skins.filter(s => re.test(s[0]));
  if (!skins.length) return {title: entry, description: "No skin has this name yet. It'll still match one if it comes out."};
  const pick = skins.find(s => s[0].toLowerCase() === entry.toLowerCase()) || skins.find(s => / Vandal$/.test(s[0])) || skins[0];
  const [, image, weapon, , rank, limited] = pick;
  const tier = db.tiers[rank];
  const lines = [skins.length === 1
    ? `${db.weapons[weapon][0]} · ${tier.name}`
    : `${skins.length} skins: ${skins.slice(0, 6).map(s => s[0]).join(", ")}${skins.length > 6 ? ", …" : ""}`];
  const stuck = skins.filter(s => s[5]).length;
  if (stuck === skins.length) lines.push(`⚠️ ${limited}: never in the daily shop`);
  else if (stuck) lines.push(`⚠️ ${stuck} of these are limited and never in the daily shop`);
  return {
    title: entry, description: lines.join("\n"), color: parseInt(tier.color.slice(1), 16),
    ...(image && {[big ? "image" : "thumbnail"]: {url: MEDIA + image}}),
  };
}

async function suggest(sub, env) {
  const query = (sub.options?.find(o => o.focused)?.value || "").trim().toLowerCase();
  const names = sub.name === "remove" ? (await readWishlist(env)).entries : (await loadDb(env))?.suggestions || [];
  const hits = names.filter(n => n.toLowerCase().includes(query));
  hits.sort((a, b) => b.toLowerCase().startsWith(query) - a.toLowerCase().startsWith(query));
  return hits.slice(0, 25).map(n => ({name: n.slice(0, 100), value: n.slice(0, 100)}));
}

// Same matching rule as wishlist.py and the website: case-insensitive, whole words.
const pattern = e => new RegExp("(?<!\\w)" + e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?!\\w)", "i");

let cache = {db: null, at: 0};
async function loadDb(env) {
  if (cache.db && Date.now() - cache.at < 3600e3) return cache.db;
  try {
    const r = await fetch(new URL("skins.json", env.SITE_URL), {cf: {cacheTtl: 3600}});
    if (!r.ok) throw new Error(`skins.json ${r.status}`);
    const db = await r.json();
    // Autocomplete for add: collections whose skins are named after them (so "Reaver" matches them all),
    // then each skin. Limited skins are left out since they never show up in the shop.
    const names = new Set();
    for (const [name, , , collection, , limited] of db.skins) {
      if (limited) continue;
      if (name.toLowerCase().startsWith(collection.toLowerCase() + " ")) names.add(collection);
      names.add(name);
    }
    db.suggestions = [...names];
    cache = {db, at: Date.now()};
  } catch {
    // No skins.json yet (or the site is down): answer without pictures.
  }
  return cache.db;
}

async function readWishlist(env) {
  const file = await gh(env, "GET");
  const lines = b64decode(file.content).split("\n");
  return {
    sha: file.sha,
    header: lines.filter(l => l.trim().startsWith("#")).join("\n"),
    entries: lines.map(l => l.trim()).filter(l => l && !l.startsWith("#")),
  };
}

function writeWishlist(env, file, message) {
  const text = (file.header ? file.header + "\n" : "") + file.entries.join("\n") + "\n";
  return gh(env, "PUT", {message, content: b64encode(text), sha: file.sha});
}

async function gh(env, method, body) {
  const url = `${API}${env.GITHUB_REPO}/contents/wishlist.txt` + (method === "GET" ? "?t=" + Date.now() : "");
  const r = await fetch(url, {
    method, body: body && JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "val-shop-wishlist-bot",
    },
  });
  if (!r.ok) {
    const hint = {401: ": token rejected", 403: ": token needs Contents read & write", 404: ": repo or file not found"}[r.status] || "";
    throw Object.assign(new Error(`GitHub ${r.status}${hint}`), {status: r.status});
  }
  return r.json();
}

function editReply(interaction, {content, embeds = []}) {
  return fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: "PATCH",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({content: content.trim().slice(0, 2000), embeds, allowed_mentions: {parse: []}}),
  });
}

async function verify(request, body, publicKey) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), {name: "Ed25519"}, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

const json = data => new Response(JSON.stringify(data), {headers: {"Content-Type": "application/json"}});
const hex = s => Uint8Array.from(s.match(/../g) || [], b => parseInt(b, 16));
const b64decode = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
const b64encode = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
