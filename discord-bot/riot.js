// Riot auth + storefront for friends who linked their account (same flow as scripts/riot.py).
// Flow: saved cookies (ssid) -> access token -> entitlements JWT + PUUID -> storefront.

const AUTHORIZE_URL = "https://auth.riotgames.com/authorize"
  + "?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in"
  + "&client_id=play-valorant-web-prod"
  + "&response_type=token%20id_token"
  + "&nonce=1&scope=account%20openid";
const ENTITLEMENTS_URL = "https://entitlements.auth.riotgames.com/api/token/v1";
const USERINFO_URL = "https://auth.riotgames.com/userinfo";
const VERSION_URL = "https://valorant-api.com/v1/version";
const SKIN_LEVEL_URL = "https://valorant-api.com/v1/weapons/skinlevels/";
const MEDIA = "https://media.valorant-api.com/";
const VP_CURRENCY = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
// Base64 JSON describing a Windows PC client; the game API requires it.
const CLIENT_PLATFORM = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";
const UA = "val-shop-checker";

// Game servers ("shards") by region. LATAM and BR play on NA's.
export const SHARDS = {na: "North America, LATAM, Brazil", eu: "Europe", ap: "Asia Pacific", kr: "Korea"};

export class RiotError extends Error {}

export const AUTH_LOGIN_URL = AUTHORIZE_URL;

// Today's shop for saved cookies: {skins: [{name, image, price, tier_color}], resets_in, cookies}.
// `cookies` comes back updated, since Riot may rotate the session on each login.
export async function fetchShop(cookies, shard, db) {
  const {token, cookies: fresh} = await accessToken(cookies);
  if (!token) throw loginFailed();
  return {...await fetchShopWithToken(token, shard, db), cookies: fresh};
}

// Same, from an access token (the "quick" link: it lasts about an hour, so there are no cookies to keep).
export async function fetchShopWithToken(token, shard, db) {
  const auth = {Authorization: `Bearer ${token}`, "User-Agent": UA};
  const [entitlements, user, version] = await Promise.all([
    riotJson(ENTITLEMENTS_URL, {method: "POST", body: "{}", headers: {...auth, "Content-Type": "application/json"}}, "entitlements"),
    riotJson(USERINFO_URL, {headers: auth}, "userinfo"),
    riotJson(VERSION_URL, {}, "client version"),
  ]);
  const store = await riotJson(`https://pd.${shard}.a.pvp.net/store/v3/storefront/${user.sub}`, {
    method: "POST", body: "{}",
    headers: {
      ...auth, "Content-Type": "application/json",
      "X-Riot-Entitlements-JWT": entitlements.entitlements_token,
      "X-Riot-ClientVersion": version.data.riotClientVersion,
      "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    },
  }, "storefront");
  const panel = store.SkinsPanelLayout;
  const prices = Object.fromEntries((panel.SingleItemStoreOffers || []).map(o => [o.OfferID.toLowerCase(), o.Cost?.[VP_CURRENCY]]));
  const byName = db ? new Map(db.skins.map(s => [s[0], s])) : new Map();
  const skins = await Promise.all(panel.SingleItemOffers.map(async id => {
    const level = await fetch(SKIN_LEVEL_URL + id).then(r => r.ok ? r.json() : null).catch(() => null);
    const name = level?.data?.displayName || `Unknown skin (${id})`;
    const info = byName.get(name);  // level 1 has the skin's own name
    return {
      name,
      image: info?.[1] ? MEDIA + info[1] : level?.data?.displayIcon || null,
      price: prices[id.toLowerCase()] ?? null,
      tier_color: info ? db.tiers[info[4]].color : null,
    };
  }));
  return {skins, resets_in: panel.SingleItemOffersRemainingDurationInSeconds, cookies: null};
}

const loginFailed = () => Object.assign(new RiotError("Riot didn't accept this login."), {loginFailed: true});

async function accessToken(cookies) {
  const r = await fetch(AUTHORIZE_URL, {
    redirect: "manual",
    headers: {Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "), "User-Agent": UA},
  });
  const fresh = {...cookies};
  for (const line of r.headers.getSetCookie()) {
    const pair = line.split(";")[0];
    const i = pair.indexOf("=");
    const [name, value] = [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
    if (value) fresh[name] = value;
    else delete fresh[name];
  }
  const fragment = new URL(r.headers.get("Location") || "https://invalid/").hash.slice(1);
  return {token: new URLSearchParams(fragment).get("access_token"), cookies: fresh};
}

async function riotJson(url, opts, context) {
  const r = await fetch(url, opts);
  if (r.status === 401 || r.status === 403) throw loginFailed();  // expired or bad token
  if (!r.ok) throw new RiotError(`${context} failed: HTTP ${r.status}`);
  return r.json();
}
