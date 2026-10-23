"""Builds site/index.html: web/index.html with today's shop, the skin database
and the wishlist embedded as JSON. All rendering happens in the browser.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "web" / "index.html"
SITE_DIR = ROOT / "site"


def render(shop: dict, db: dict, wishlist: list[str], now: float | None = None) -> str:
    now = time.time() if now is None else now
    data = {
        "repo": os.environ.get("GITHUB_REPOSITORY", ""),  # "owner/name", enables wishlist sync
        "shop": shop,
        "reset_at": int(now + (shop.get("resets_in") or 0)),
        "wishlist": wishlist,
        "db": db,
    }
    # "</" inside a <script> would end it early.
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    return TEMPLATE.read_text().replace("{{data}}", payload)


def write(shop: dict, db: dict, wishlist: list[str]) -> Path:
    SITE_DIR.mkdir(exist_ok=True)
    out = SITE_DIR / "index.html"
    out.write_text(render(shop, db, wishlist))
    return out
