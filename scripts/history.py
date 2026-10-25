"""Shop history: one line per UTC day (= shop day) in history/shop.jsonl.

Riot only shows today's shop, so stats can only cover days recorded here.
The workflow commits the file after each run.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

HISTORY_FILE = Path(__file__).resolve().parent.parent / "history" / "shop.jsonl"


def load(path: Path = HISTORY_FILE) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def record(shop: dict, path: Path = HISTORY_FILE, now: float | None = None) -> bool:
    """Append today's shop unless today is already recorded (backup and manual runs). True if added."""
    date = time.strftime("%Y-%m-%d", time.gmtime(time.time() if now is None else now))
    if any(day["date"] == date for day in load(path)):
        return False
    skins = [{"id": s["id"], "name": s["name"], "price": s["price"]} for s in shop["skins"]]
    path.parent.mkdir(exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps({"date": date, "skins": skins}, ensure_ascii=False) + "\n")
    return True
