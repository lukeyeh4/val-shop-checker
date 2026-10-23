"""Wishlist: skins you're waiting for, one per line in wishlist.txt.

Matching is case-insensitive on whole words: "Prime" matches "Prime Vandal"
but "Ion" doesn't match "Champions". Blank lines and lines starting with #
are ignored. The website uses the same rule (see web/index.html).
"""
from __future__ import annotations

import re
from pathlib import Path

WISHLIST_FILE = Path(__file__).resolve().parent.parent / "wishlist.txt"


def load(path: Path = WISHLIST_FILE) -> list[str]:
    if not path.exists():
        return []
    lines = (line.strip() for line in path.read_text().splitlines())
    return [line for line in lines if line and not line.startswith("#")]


def match(skin_name: str, wishlist: list[str]) -> str | None:
    """The wishlist entry that matches this skin, or None."""
    return next(
        (entry for entry in wishlist if re.search(rf"(?<!\w){re.escape(entry)}(?!\w)", skin_name, re.I)),
        None,
    )
