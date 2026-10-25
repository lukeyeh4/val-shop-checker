// Discord bot (Cloudflare Worker): /wishlist shows, adds or removes wishlist.txt entries; /shop shows today's
// shop; /stats shows shop statistics. Discord POSTs each command here; edits commit to the repo the same way
// the website's sync does, and that push rebuilds the site. Skin pictures and autocomplete come from the site's
// skins.json, the shop from its shop.json, statistics from its stats.json.
// Friends can /link their Riot account (saved in the LINKS KV namespace) so /shop shows their own shop.

import {fetchShop, fetchShopWithToken, RiotError, SHARDS} from "./riot.js";
import {linkPage} from "./link-page.js";

const API = "https://api.github.com/repos/";
const MEDIA = "https://media.valorant-api.com/";
const EPHEMERAL = 64;  // replies only you can see
const MAX_EMBEDS = 10;  // Discord's limit per message

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/link/")) return linkRoute(request, path.slice("/link/".length), env);
    if (request.method !== "POST") return new Response("val-shop wishlist bot");
    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) return new Response("bad signature", {status: 401});
    const interaction = JSON.parse(body);
    if (interaction.type === 1) return json({type: 1});  // Discord's endpoint check
    if (interaction.type !== 2 && interaction.type !== 4) return new Response("unhandled", {status: 400});

    const userId = (interaction.member || interaction).user.id;
    const owner = userId === env.DISCORD_USER_ID;
    const command = interaction.data.name;
    const isPublic = command !== "wishlist";  // anyone can use these (the website is public too)
    if (interaction.type === 4) {  // autocomplete while typing
      const sub = command === "stats" ? {name: "add", options: interaction.data.options} : interaction.data.options[0];
      return json({type: 8, data: {choices: owner || command === "stats" ? await suggest(sub, env) : []}});
    }
    if (!owner && !isPublic) return json({type: 4, data: {content: "Only the wishlist owner can use this.", flags: EPHEMERAL}});
    if (command === "link") return json({type: 4, data: await linkReply(userId, request, env)});
    if (command === "unlink") {
      await env.LINKS.delete(`user:${userId}`);
      return json({type: 4, data: {content: "Unlinked: your saved Riot login is deleted.", flags: EPHEMERAL}});
    }
    let reply;
    if (command === "shop" && !owner) {
      const linked = await env.LINKS.get(`user:${userId}`, "json");
      if (!linked) return json({type: 4, data: {content: "`/shop` shows your own shop once you link your Riot account: run `/link`.", flags: EPHEMERAL}});
      if (!linked.cookies && linked.shop.reset_at * 1000 <= Date.now()) {  // a quick link only covers the day it was made
        return json({type: 4, data: {content: "Your shop reset. Run `/link` again to see the new one (about 20 seconds).", flags: EPHEMERAL}});
      }
      reply = friendShop(userId, linked, env);
    } else {
      reply = command === "shop" ? shopReply(env)
        : command === "stats" ? statsReply(interaction.data.options?.[0]?.value, env)
        : handle(interaction.data.options[0], env);
    }
    // Discord wants an answer within 3s and GitHub can be slower: say "thinking…", then edit in the result.
    ctx.waitUntil(reply
      .catch(e => ({content: `⚠️ ${e.message}`}))
      .then(r => editReply(interaction, r)));
    return json({type: 5, data: {flags: isPublic ? 0 : EPHEMERAL}});
  },
};

// /shop: the latest shop the daily run saved next to the website (same look as the daily post).
async function shopReply(env) {
  const r = await fetch(new URL("shop.json?t=" + Date.now(), env.SITE_URL));  // fresh copy, not the CDN's
  if (!r.ok) throw new Error(`Couldn't load the shop (site said ${r.status})`);
  const {shop, reset_at} = await r.json();
  if (shop.error) return {content: `⚠️ Couldn't check the shop: ${shop.error}`};
  const hits = shop.skins.filter(s => s.wishlist_match).map(s => s.name);
  const lines = hits.length ? [`★ **${hits.join(", ")}** in the shop`] : [];
  lines.push(reset_at * 1000 > Date.now()
    ? `Resets <t:${reset_at}:R>`
    : `⚠️ The shop reset <t:${reset_at}:R> and the new one hasn't been fetched yet, so this is the previous shop.`);
  return shopMessage(lines, shop.skins, env.SITE_URL);
}

function shopMessage(lines, skins, url) {
  const embeds = skins.map(s => ({
    title: (s.wishlist_match ? "★ " : "") + s.name,
    description: s.price ? `**${s.price.toLocaleString("en-US")}** VP` : "",
    color: s.tier_color ? parseInt(s.tier_color.slice(1), 16) : 0x8B8F98,
    ...(s.image && {image: {url: s.image}}),
  }));
  if (url && embeds.length) embeds[0].url = url;
  return {content: lines.join("\n"), embeds};
}

// /shop for a friend: their saved shop until it resets, then a fresh one with their saved login.
async function friendShop(userId, linked, env) {
  let shop = linked.shop;
  if (!shop || shop.reset_at * 1000 <= Date.now()) {
    try {
      shop = await saveLink(env, userId, await fetchShop(linked.cookies, linked.shard, await loadDb(env)), linked.shard);
    } catch (e) {
      throw new Error(e.loginFailed ? `${e.message} Run /link again.` : `Couldn't get your shop: ${e.message}`);
    }
  }
  return shopMessage([`<@${userId}>'s shop · resets <t:${shop.reset_at}:R>`], shop.skins);
}

async function saveLink(env, userId, fetched, shard) {
  const shop = {skins: fetched.skins, reset_at: Math.floor(Date.now() / 1000) + (fetched.resets_in || 0)};
  await env.LINKS.put(`user:${userId}`, JSON.stringify({cookies: fetched.cookies, shard, shop}));
  return shop;
}

// The owner can link too, to try the flow; their own /shop keeps coming from the daily run.
async function linkReply(userId, request, env) {
  const token = crypto.randomUUID();
  await env.LINKS.put(`link:${token}`, userId, {expirationTtl: 600});
  return {
    content: "Tap to link your Riot account. It works on your phone, once, for 10 minutes. Don't share it.",
    flags: EPHEMERAL,
    components: [{type: 1, components: [{type: 2, style: 5, label: "Link Riot account", url: new URL(`/link/${token}`, request.url).href}]}],
  };
}

// The page behind /link's button: shows the form, then checks the ssid against Riot and saves it.
async function linkRoute(request, token, env) {
  const userId = await env.LINKS.get(`link:${token}`);
  if (!userId) return linkPage({expired: true});
  if (request.method !== "POST") return linkPage();
  const form = await request.formData();
  const input = String(form.get("login") || "").trim();
  const shard = Object.hasOwn(SHARDS, form.get("shard")) ? form.get("shard") : "na";
  // The address Riot's sign-in lands on carries an access token; anything else should be the ssid cookie.
  const accessToken = /access_token=([^&\s#]+)/.exec(input)?.[1];
  const cookies = accessToken ? null : parseCookies(input);
  if (!accessToken && !cookies.ssid) {
    return linkPage({error: "That doesn't look like the playvalorant.com address. Sign in with the button, then copy the address of the page you land on."});
  }
  try {
    const fetched = accessToken
      ? await fetchShopWithToken(decodeURIComponent(accessToken), shard, await loadDb(env))
      : await fetchShop(cookies, shard, await loadDb(env));
    const shop = await saveLink(env, userId, fetched, shard);
    await env.LINKS.delete(`link:${token}`);
    return linkPage({done: shop.skins, quick: !!accessToken, owner: userId === env.DISCORD_USER_ID});
  } catch (e) {
    if (!(e instanceof RiotError)) return linkPage({error: "Something went wrong. Try again."});
    if (!e.loginFailed) return linkPage({error: `${e.message}. Is the region right?`});
    return linkPage({error: accessToken
      ? "Riot didn't accept that address (they expire after about an hour). Sign in again and paste the new one."
      : "Riot didn't accept that ssid. Copy it again while signed in."});
  }
}

// "abc", "ssid=abc" or a whole cookie header ("Cookie: ssid=abc; clid=…") -> {ssid: "abc", …}.
function parseCookies(input) {
  const text = input.replace(/^cookie:\s*/i, "");
  if (/^https?:/i.test(text)) return {};  // an address without the token part
  if (!text.includes("=")) return text && !/\s/.test(text) ? {ssid: text} : {};
  return Object.fromEntries(text.split(";").map(p => p.trim().split(/=(.*)/s).slice(0, 2)).filter(([k, v]) => k && v));
}

// /stats: an overview, or one skin or line ("Reaver") with how often it showed up and its odds.
async function statsReply(query, env) {
  const [r, db] = await Promise.all([fetch(new URL("stats.json?t=" + Date.now(), env.SITE_URL)), loadDb(env)]);
  if (!r.ok) throw new Error(`Couldn't load stats (site said ${r.status})`);
  const stats = await r.json();
  return query?.trim() ? skinStats(query.trim(), stats, db) : overview(stats, env.DISCORD_USER_ID);
}

function overview(s, ownerId) {
  const w = s.wishlist;
  const wish = w.skins ? [
    `${w.skins} shop skin${w.skins === 1 ? "" : "s"} on it`,
    `${pct(w.daily_odds)} chance a day, about every ${w.expected_days} days`,
    `Within 7 / 30 / 90 days: ${["7", "30", "90"].map(d => pct(w.within[d])).join(" / ")}`,
  ] : ["Empty. Add skins with /wishlist add."];
  const last = w.hits.at(-1);
  if (s.days) wish.push(last ? `Hits: ${w.hits.length}, last ${ago(last.date)} (${last.skins.join(", ")})` : "No hits yet");
  const fields = [{name: "Your wishlist", value: wish.join("\n")}];
  if (s.days) {
    const money = n => n.toLocaleString("en-US");
    fields.push(
      {name: "Shops", value: `Average **${money(s.avg_value)}** VP\nPriciest ${money(s.priciest.value)} VP (${ago(s.priciest.date)})`, inline: true},
      {name: "Tiers (vs. all skins)", value: s.tiers.filter(t => t.slots).map(t => `${t.name} ${pct(t.share)} (${pct(t.catalog_share)})`).join("\n") || "-", inline: true},
      {name: "Top weapons", value: s.weapons.slice(0, 5).map(x => `${x.name} ×${x.slots}`).join("\n") || "-", inline: true},
    );
  }
  const since = `<@${ownerId}>'s shop. ` + (s.days ? `${s.days} day${s.days === 1 ? "" : "s"} tracked, since ${s.first_day}` : "No days recorded yet. Tracking starts with the next daily shop.");
  return {content: "", embeds: [{title: "Shop stats", description: since, color: 0xFF4655, fields}]};
}

function skinStats(query, s, db) {
  if (!db) throw new Error("The skin list isn't available right now, try again in a minute");
  const re = pattern(query);
  if (!db.skins.some(x => re.test(x[0]))) return {content: `No skin matches **${query}**.`};
  const shopSkins = db.skins.filter(x => re.test(x[0]) && !x[5]).length;
  const seen = Object.entries(s.skins).filter(([name]) => re.test(name)).map(([, x]) => x);
  const count = seen.reduce((n, x) => n + x.count, 0);
  const p = dailyOdds(shopSkins, s.eligible);
  const lines = [
    !s.days ? "No days recorded yet."
      : count ? `Seen **${count}×** in ${s.days} tracked day${s.days === 1 ? "" : "s"}, last ${ago(seen.map(x => x.last).sort().at(-1))}`
      : `Not seen in ${s.days} tracked day${s.days === 1 ? "" : "s"}`,
    shopSkins && `${pct(p)} chance a day, about every ${Math.round(1 / p)} days; ${pct(1 - (1 - p) ** 30)} within 30 days`,
  ].filter(Boolean);  // limited skins already carry a warning from card()
  const embed = card(query, db, false);
  embed.description += "\n\n" + lines.join("\n");
  return {content: "", embeds: [embed]};
}

// Same estimate as stats.py: chance at least one of `matching` skins is among 4 even picks from `eligible`.
function dailyOdds(matching, eligible, slots = 4) {
  let miss = 1;
  for (let i = 0; i < slots; i++) miss *= Math.max(eligible - matching - i, 0) / (eligible - i);
  return 1 - miss;
}

const pct = p => p > 0.995 ? ">99%" : `${(p * 100).toFixed(p >= 0.1 ? 0 : p >= 0.01 ? 1 : 2)}%`;

// "today", "yesterday", "12 days ago" for a shop day (UTC date).
function ago(date) {
  const now = new Date();
  const days = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.parse(date)) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

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
    const r = await fetch(new URL("skins.json", env.SITE_URL), {cf: {cacheTtlByStatus: {"200-299": 3600, "400-599": 0}}});
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
