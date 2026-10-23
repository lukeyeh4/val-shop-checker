"""Posts the daily shop to a Discord webhook.

One message, one embed per skin (image, VP price, tier color). If any skin is
on the wishlist, the message @mentions DISCORD_USER_ID so your phone pings.
"""
from __future__ import annotations

import requests

VP_ICON = "https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png"
DEFAULT_COLOR = 0x8B8F98


def build_message(shop: dict, user_id: str = "", site_url: str = "") -> dict:
    hits = [s["name"] for s in shop["skins"] if s.get("wishlist_match")]
    embeds = []
    for skin in shop["skins"]:
        star = "★ " if skin.get("wishlist_match") else ""
        embed = {
            "title": f"{star}{skin['name']}",
            "description": f"**{skin['price']:,}** VP" if skin.get("price") else "",
            "color": int(skin["tier_color"].lstrip("#"), 16) if skin.get("tier_color") else DEFAULT_COLOR,
        }
        if skin.get("image"):
            embed["image"] = {"url": skin["image"]}
        embeds.append(embed)

    if site_url and embeds:
        embeds[0]["url"] = site_url
    if shop.get("resets_in") and embeds:
        h, m = divmod(shop["resets_in"] // 60, 60)
        embeds[-1]["footer"] = {"text": f"Resets in {h}h {m}m", "icon_url": VP_ICON}

    content = ""
    if hits:
        mention = f"<@{user_id}> " if user_id else ""
        content = f"{mention}★ **{', '.join(hits)}** in your shop today"
    return {
        "username": "VALORANT Shop",
        "avatar_url": VP_ICON,
        "content": content,
        "embeds": embeds,
        # Only ever ping the configured user, never @everyone/roles.
        "allowed_mentions": {"users": [user_id] if user_id else []},
    }


def build_error(reason: str, user_id: str = "") -> dict:
    mention = f"<@{user_id}> " if user_id else ""
    return {
        "username": "VALORANT Shop",
        "avatar_url": VP_ICON,
        "content": f"{mention}⚠️ Couldn't check your shop today",
        "embeds": [{"description": reason, "color": 0xFF4655}],
        "allowed_mentions": {"users": [user_id] if user_id else []},
    }


def post(webhook_url: str, message: dict) -> None:
    resp = requests.post(webhook_url, json=message, timeout=15)
    if resp.status_code >= 400:
        raise RuntimeError(f"Discord webhook failed: HTTP {resp.status_code} {resp.text[:300]}")
