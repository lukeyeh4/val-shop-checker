"""Riot auth + VALORANT storefront, shop only.

Flow: ssid cookie -> access token -> entitlements JWT + PUUID -> storefront.
Skin names/images come from the community valorant-api.com.
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import requests

import limited

AUTHORIZE_URL = (
    "https://auth.riotgames.com/authorize"
    "?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in"
    "&client_id=play-valorant-web-prod"
    "&response_type=token%20id_token"
    "&nonce=1&scope=account%20openid"
)
ENTITLEMENTS_URL = "https://entitlements.auth.riotgames.com/api/token/v1"
USERINFO_URL = "https://auth.riotgames.com/userinfo"
VERSION_URL = "https://valorant-api.com/v1/version"
SKINS_URL = "https://valorant-api.com/v1/weapons/skins"
TIERS_URL = "https://valorant-api.com/v1/contenttiers"
WEAPONS_URL = "https://valorant-api.com/v1/weapons"
THEMES_URL = "https://valorant-api.com/v1/themes"
MEDIA_URL = "https://media.valorant-api.com/"
CATEGORY_NAMES = {"Sidearm": "Sidearms", "SMG": "SMGs", "Shotgun": "Shotguns", "Rifle": "Rifles",
                  "Sniper": "Snipers", "Heavy": "Machine guns", "Melee": "Melee"}
CATEGORIES = list(CATEGORY_NAMES.values())
VP_CURRENCY = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"
# Base64 JSON describing a Windows PC client; the game API requires it.
CLIENT_PLATFORM = (
    "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9T"
    "VmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24i"
    "DQp9"
)
COOKIE_DOMAIN = "auth.riotgames.com"


class RiotError(Exception):
    pass


def session_from_cookies(cookies: dict) -> requests.Session:
    session = requests.Session()
    for name, value in cookies.items():
        session.cookies.set(name, value, domain=COOKIE_DOMAIN)
    return session


def cookies_from_session(session: requests.Session) -> dict:
    """Current auth cookies (Riot may rotate ssid on reauth)."""
    return {c.name: c.value for c in session.cookies if c.domain.lstrip(".") == COOKIE_DOMAIN}


def get_access_token(session: requests.Session) -> str | None:
    """Mints an access token from the session's ssid cookie. None if the cookie is dead."""
    resp = session.get(AUTHORIZE_URL, allow_redirects=False, timeout=15)
    fragment = urlparse(resp.headers.get("Location", "")).fragment
    tokens = parse_qs(fragment).get("access_token")
    return tokens[0] if tokens else None


def _json(resp: requests.Response, context: str) -> dict:
    try:
        resp.raise_for_status()
        return resp.json()
    except (requests.HTTPError, ValueError):
        raise RiotError(f"{context} failed: HTTP {resp.status_code} {resp.text[:300]!r}")


def _client_version() -> str:
    resp = requests.get(VERSION_URL, timeout=10)
    return _json(resp, "client version")["data"]["riotClientVersion"]


def _game_headers(session: requests.Session, access_token: str) -> tuple[dict, str]:
    headers = {"Authorization": f"Bearer {access_token}"}
    entitlements = _json(session.post(ENTITLEMENTS_URL, headers=headers, json={}, timeout=15), "entitlements")
    puuid = _json(session.get(USERINFO_URL, headers=headers, timeout=15), "userinfo")["sub"]
    headers.update(
        {
            "X-Riot-Entitlements-JWT": entitlements["entitlements_token"],
            "X-Riot-ClientVersion": _client_version(),
            "X-Riot-ClientPlatform": CLIENT_PLATFORM,
        }
    )
    return headers, puuid


def _tier_colors() -> dict:
    """Content tier UUID -> hex color (Select, Deluxe, Premium, Exclusive, Ultra)."""
    data = _json(requests.get(TIERS_URL, timeout=10), "content tiers")["data"]
    return {t["uuid"]: "#" + t["highlightColor"][:6] for t in data if t.get("highlightColor")}


def _skin_catalog() -> dict:
    """Skin level UUID -> {name, image, tier_color}. Level 1 of a skin is what the shop sells."""
    data = _json(requests.get(SKINS_URL, timeout=20), "skin catalog")["data"]
    colors = _tier_colors()
    catalog = {}
    for skin in data:
        chromas = skin.get("chromas") or [{}]
        image = skin.get("displayIcon") or chromas[0].get("fullRender") or chromas[0].get("displayIcon")
        info = {"name": skin["displayName"], "image": image, "tier_color": colors.get(skin.get("contentTierUuid"))}
        for level in skin.get("levels", []):
            catalog[level["uuid"].lower()] = info
    return catalog


def skin_database() -> dict:
    """Every skin that can appear in the shop, compact for embedding in the site.

    Returns {"weapons": [[name, category]] (buy-menu order), "tiers": [{name, color}] (index = rank),
             "skins": [[name, image_path, weapon_idx, collection, tier_rank, limited_reason]]}.
    image_path is relative to https://media.valorant-api.com/; limited_reason is "" for
    skins that can show up in the shop.
    """
    weapons = _json(requests.get(WEAPONS_URL, timeout=20), "weapons")["data"]
    # Buy-menu order: by category, then by price within it.
    weapons.sort(key=lambda w: (CATEGORIES.index(_category(w)), (w.get("shopData") or {}).get("cost", 0)))
    themes = {t["uuid"]: t["displayName"] for t in _json(requests.get(THEMES_URL, timeout=10), "themes")["data"]}
    tier_data = _json(requests.get(TIERS_URL, timeout=10), "content tiers")["data"]
    ranks = {t["uuid"]: t["rank"] for t in tier_data}
    tiers = [{"name": t["displayName"].split()[0], "color": "#" + t["highlightColor"][:6]}
             for t in sorted(tier_data, key=lambda t: t["rank"])]

    skins = []
    for idx, weapon in enumerate(weapons):
        for skin in weapon["skins"]:
            if skin.get("contentTierUuid") not in ranks:
                continue  # standard / battle pass skins never show up in the shop
            chroma = (skin.get("chromas") or [{}])[0]
            image = skin.get("displayIcon") or chroma.get("fullRender") or chroma.get("displayIcon") or ""
            collection = themes.get(skin.get("themeUuid"), skin["displayName"])
            skins.append([skin["displayName"], image.replace(MEDIA_URL, ""), idx, collection,
                          ranks[skin["contentTierUuid"]], limited.reason(collection)])
    return {"weapons": [[w["displayName"], _category(w)] for w in weapons], "tiers": tiers, "skins": skins}


def _category(weapon: dict) -> str:
    """"EEquippableCategory::Heavy" -> "Machine guns", etc."""
    raw = weapon.get("category", "").split("::")[-1]
    return CATEGORY_NAMES.get(raw, "Melee")


def fetch_shop(session: requests.Session, access_token: str, region: str = "na") -> dict:
    """Returns {"skins": [{id, name, image, price}], "resets_in": seconds}."""
    headers, puuid = _game_headers(session, access_token)
    url = f"https://pd.{region}.a.pvp.net/store/v3/storefront/{puuid}"
    panel = _json(session.post(url, headers=headers, json={}, timeout=15), "storefront")["SkinsPanelLayout"]

    prices = {
        offer["OfferID"].lower(): offer.get("Cost", {}).get(VP_CURRENCY)
        for offer in panel.get("SingleItemStoreOffers", [])
    }
    catalog = _skin_catalog()
    skins = []
    for item_id in panel["SingleItemOffers"]:
        info = catalog.get(item_id.lower(), {"name": f"Unknown skin ({item_id})", "image": None, "tier_color": None})
        skins.append({"id": item_id, **info, "price": prices.get(item_id.lower())})
    return {"skins": skins, "resets_in": panel.get("SingleItemOffersRemainingDurationInSeconds")}
