"""Shop statistics from history/shop.jsonl, written to site/stats.json at build time.

Tier and weapon come from the skin database (by name), so history only stores
what the shop showed. Wishlist hits use the current wishlist. Odds assume Riot
picks the 4 skins evenly at random from every shop-eligible skin; its real
weighting isn't public, so the observed hits are reported next to them.
"""
from __future__ import annotations

import wishlist as wl

ODDS_WINDOWS = (7, 30, 90)


def daily_odds(matching: int, eligible: int, slots: int = 4) -> float:
    """Chance that at least one of `matching` skins is among `slots` picks from `eligible`."""
    miss = 1.0
    for i in range(slots):
        miss *= max(eligible - matching - i, 0) / (eligible - i)
    return 1 - miss


def compute(days: list[dict], db: dict, wanted: list[str]) -> dict:
    by_name = {s[0]: s for s in db["skins"]}
    eligible = [s for s in db["skins"] if not s[5]]

    skins: dict[str, dict] = {}
    tier_slots = [0] * len(db["tiers"])
    weapon_slots = [0] * len(db["weapons"])
    values, hits = [], []
    for day in days:
        for skin in day["skins"]:
            seen = skins.setdefault(skin["name"], {"count": 0, "first": day["date"]})
            seen["count"] += 1
            seen["last"] = day["date"]
            info = by_name.get(skin["name"])
            if info:
                tier_slots[info[4]] += 1
                weapon_slots[info[2]] += 1
        values.append({"date": day["date"], "value": sum(s["price"] or 0 for s in day["skins"])})
        matched = [s["name"] for s in day["skins"] if wl.match(s["name"], wanted)]
        if matched:
            hits.append({"date": day["date"], "skins": matched})

    total_slots = sum(tier_slots) or 1
    catalog = [sum(1 for s in eligible if s[4] == rank) for rank in range(len(db["tiers"]))]
    tiers = [{**tier, "slots": tier_slots[rank], "share": tier_slots[rank] / total_slots,
              "catalog_share": catalog[rank] / len(eligible)} for rank, tier in enumerate(db["tiers"])]
    weapons = sorted(({"name": db["weapons"][i][0], "slots": n} for i, n in enumerate(weapon_slots) if n),
                     key=lambda w: -w["slots"])

    want = sum(1 for s in eligible if wl.match(s[0], wanted))
    p = daily_odds(want, len(eligible))
    return {
        "days": len(days),
        "first_day": days[0]["date"] if days else None,
        "last_day": days[-1]["date"] if days else None,
        "eligible": len(eligible),
        "avg_value": round(sum(v["value"] for v in values) / len(values)) if values else None,
        "priciest": max(values, key=lambda v: v["value"]) if values else None,
        "tiers": tiers,
        "weapons": weapons,
        "skins": skins,
        "wishlist": {
            "entries": len(wanted),
            "skins": want,
            "daily_odds": p,
            "expected_days": round(1 / p) if p else None,
            "within": {str(d): 1 - (1 - p) ** d for d in ODDS_WINDOWS},
            "hits": hits,
        },
    }
