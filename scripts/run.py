"""Fetch today's shop, check it against the wishlist, build the site, post to Discord.

Cookies come from the RIOT_COOKIES env var (CI) or .cookies.json (local,
created by bootstrap.py). Rotated cookies are written back to .cookies.json.

Discord settings come from env vars, or a gitignored .env file for local runs:
    DISCORD_WEBHOOK_URL   webhook to post to (skipped if unset)
    DISCORD_USER_ID       your Discord user ID, pinged on wishlist matches
    SITE_URL              optional link to the website

    --no-discord          build the site without posting
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

import notify
import webpage
import wishlist
from riot import RiotError, cookies_from_session, fetch_shop, get_access_token, session_from_cookies, skin_database

ROOT = Path(__file__).resolve().parent.parent
COOKIES_FILE = ROOT / ".cookies.json"
ENV_FILE = ROOT / ".env"


def load_env_file() -> None:
    """KEY=VALUE lines from .env; real env vars win."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_cookies() -> dict:
    raw = os.environ.get("RIOT_COOKIES") or (COOKIES_FILE.read_text() if COOKIES_FILE.exists() else "")
    try:
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


def save_cookies(cookies: dict) -> None:
    """Persist Riot's rotated ssid: locally to .cookies.json, in CI to $COOKIES_OUT
    (the workflow copies that into the RIOT_COOKIES secret)."""
    if os.environ.get("GITHUB_ACTIONS"):
        for value in cookies.values():
            print(f"::add-mask::{value}")  # never let a cookie show up in the logs
        out = os.environ.get("COOKIES_OUT")
        if out:
            Path(out).write_text(json.dumps(cookies))
    elif not os.environ.get("RIOT_COOKIES"):
        COOKIES_FILE.write_text(json.dumps(cookies))


def fail(reason: str, wanted: list[str]) -> None:
    """Session/shop failure: still publish the site (with a banner) and warn on Discord."""
    print(reason, file=sys.stderr)
    print(f"Site: {webpage.write({'skins': [], 'resets_in': 0, 'error': reason}, skin_database(), wanted)}")
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if webhook and "--no-discord" not in sys.argv:
        notify.post(webhook, notify.build_error(reason, os.environ.get("DISCORD_USER_ID", "").strip()))
    sys.exit(1)


def main():
    load_env_file()
    wanted = wishlist.load()
    cookies = load_cookies()
    if not cookies:
        fail("No Riot session saved. Run scripts/bootstrap.py and update RIOT_COOKIES.", wanted)

    session = session_from_cookies(cookies)
    access_token = get_access_token(session)
    if access_token is None:
        fail("Riot session expired. Run scripts/bootstrap.py with a fresh ssid and update RIOT_COOKIES.", wanted)
    save_cookies(cookies_from_session(session))

    try:
        shop = fetch_shop(session, access_token, region=os.environ.get("REGION", "na"))
    except (RiotError, requests.RequestException) as e:
        fail(f"Fetching the shop failed: {e}", wanted)

    for skin in shop["skins"]:
        skin["wishlist_match"] = wishlist.match(skin["name"], wanted)

    for skin in shop["skins"]:
        star = "★" if skin["wishlist_match"] else " "
        print(f"{star} {skin['name']:<32} {skin['price'] or '?':>5} VP")
    hits = [s["name"] for s in shop["skins"] if s["wishlist_match"]]
    print(f"\nWishlist matches: {', '.join(hits) if hits else 'none'}")
    print(f"Site: {webpage.write(shop, skin_database(), wanted)}")

    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if "--no-discord" in sys.argv or not webhook:
        print("Discord: skipped")
    else:
        message = notify.build_message(
            shop, os.environ.get("DISCORD_USER_ID", "").strip(), os.environ.get("SITE_URL", "").strip()
        )
        notify.post(webhook, message)
        print("Discord: posted" + (" (pinged you)" if hits else ""))


if __name__ == "__main__":
    main()
