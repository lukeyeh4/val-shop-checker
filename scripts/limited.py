"""Skins that can never appear in the daily shop or Night Market.

Riot no longer exposes a store-offers endpoint (store/v1/offers 404s as of
Oct 2026), so this is a curated list of limited bundles/capsules, matched on
the collection (theme) name. Only collections confirmed as limited are listed;
unclear ones (e.g. Ignite, Team Ace) are left out so we never wrongly flag.
"""
from __future__ import annotations

import re

RULES = [
    (r"^Champions \d{4}$", "Champions bundle (limited)"),
    (r"^VCT LOCK//IN$", "LOCK//IN bundle (limited)"),
    (r"^VCT \d{4} Season$", "VCT season capsule (limited)"),
    (r"^VCT x ", "VCT team capsule (limited)"),
    (r"^Arcane", "Arcane bundle (limited)"),
    (r"^5 Years // Beta Remastered$", "Anniversary bundle (limited)"),
]


def reason(collection: str) -> str:
    """Why a skin in this collection can't show up in the shop, or "" if it can."""
    return next((why for pattern, why in RULES if re.search(pattern, collection)), "")
