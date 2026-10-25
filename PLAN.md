# Plan

Goal: see my 4 daily VALORANT shop skins from any device, and get pinged when
a skin I'm waiting for shows up. Region: **NA**.

Based on [Turtdle/ValorantShopChecker](https://github.com/Turtdle/ValorantShopChecker),
trimmed to the shop only (no rank or match stats).

## Features

- **A. Website:** a static page on GitHub Pages, rebuilt daily, showing the 4 skins
  (image, name, VP price) and a countdown to the next reset. You can add it to
  your phone's home screen.
- **B. Discord:** a webhook post every day after reset. If a wishlist skin is
  in the shop, the post @mentions you so your phone sends a notification.
- **C. Wishlist:** a ★ tab on the website for browsing all ~1,400 shop-eligible
  skins with images. You can search by skin or collection, filter by weapon or category
  (a picker laid out like the in-game buy menu), and
  star single skins or a whole collection. Starred shop cards are highlighted.
  Skins that can never be in the daily shop (Champions, VCT capsules, Arcane, etc.,
  curated in `scripts/limited.py`) get a lock icon, and starring one shows a heads-up.
  `wishlist.txt` in the repo stores the list that Discord uses (whole-word,
  case-insensitive matching, e.g. `Reaver` = every Reaver skin).
  Stars sync to `wishlist.txt` through the GitHub API once a token is added on
  that device; without one they stay in that browser.
- **D. Discord bot:** `/wishlist show|add|remove` (owner only, with skin pictures,
  autocomplete and limited-skin warnings) and `/shop` (anyone, today's shop). A
  Cloudflare Worker (`discord-bot/`) reads `skins.json` and `shop.json`, which each
  run publishes next to the site, and edits `wishlist.txt` through the GitHub API.

## How it works

1. **Auth:** reuse the Riot `ssid` cookie → `GET auth.riotgames.com/authorize`
   (no redirects) → access token taken from the `Location` header.
2. **Tokens:** access token → entitlements JWT plus PUUID (from `/userinfo`).
3. **Shop:** `POST pd.na.a.pvp.net/store/v3/storefront/{puuid}` →
   `SkinsPanelLayout.SingleItemOffers` (4 skin UUIDs), offer prices, and the
   time left until reset.
4. **Enrich:** `valorant-api.com/v1/weapons/skinlevels` for names and images.
5. **Output:** check `wishlist.txt` → build `site/index.html` → post to Discord.
6. **Persist:** if Riot replaces the cookie, write the new one back to the
   `RIOT_COOKIES` secret.

## Files

```
scripts/
  riot.py        # auth + storefront + skin lookup
  bootstrap.py   # run locally once: paste ssid, verify, print secret JSON
  run.py         # CI entrypoint: fetch → wishlist match → build site → Discord
  webpage.py     # renders site/index.html from shop data
wishlist.txt     # skins I'm waiting for
web/index.html   # page template (shop + wishlist browser), data injected at build
.github/workflows/shop.yml   # daily run + manual trigger; deploys Pages
discord-bot/   # Cloudflare Worker for /wishlist and /shop
scripts/register_commands.py # registers the slash commands with Discord
requirements.txt             # requests
```

## Milestones

- [x] **1. Local fetch:** `riot.py` + `bootstrap.py`. Paste ssid → print the 4 skins
      in the terminal.
- [x] **2. Wishlist:** `wishlist.txt` + matching. Print matches locally.
- [x] **3. Website:** `webpage.py` writes `site/index.html`. Preview it locally.
- [x] **4. Discord:** embed with skin images; @mention when the wishlist matches.
- [x] **5. GitHub Action:** daily run, deploy to Pages, post to Discord. Website
      stars commit to `wishlist.txt` via the GitHub API (fine-grained token entered
      once per device), so the site, devices and Discord share one list.
      Secrets: `RIOT_COOKIES`, `DISCORD_WEBHOOK_URL`, `DISCORD_USER_ID`, `GH_PAT`.
- [x] **6. Cookie refresh + expiry alert:** write rotated cookies back to the
      secret; when the session dies, post a warning on Discord and show a banner
      on the site.
- [x] **7. Docs:** fill in README setup steps.
- [x] **8. Discord bot:** `/wishlist` and `/shop` on a Cloudflare Worker.

## Decisions

- **Reset time:** the shop resets at 00:00 UTC (5pm PDT / 4pm PST). GitHub's own
  cron (00:17, 00:47, 02:17) turned out to be unreliable for this repo, so an
  external cron-job.org job triggers the workflow through the API (a fine-grained
  token with *Actions: read/write*). Only the first success of the UTC day posts to Discord.
- **Pages visibility:** on a free plan the repo must be public for Pages.
  Secrets stay hidden, but the page itself is viewable by anyone with the URL.
  Never write tokens or cookies to `site/`.
- **GH_PAT:** a fine-grained token limited to this repo with *Secrets:
  read/write*.

## Next: statistics (plan)

Goal: answer "how often does a skin show up?", "how long since I last saw it?"
and "what are my odds of seeing a wishlist skin?". Riot doesn't expose past shops,
so nothing can be backfilled. Stats start from the day recording begins.

**Recording**
- Each run that fetches a shop appends one line to `history/shop.jsonl`:
  `{"date": "2026-10-26", "skins": [{"name", "uuid", "price", "tier"}]}`.
  Use one line per UTC day: skip if that date is already there (backup and manual runs).
- The workflow commits the file (`permissions: contents: write`). Commits made with
  `GITHUB_TOKEN` don't trigger other workflows, and the push trigger only watches
  `wishlist.txt`, so this can't loop. Size is about 200 bytes a day (~70 KB a year).
- Days where the fetch failed are simply missing. Stats count tracked days, not
  calendar days.

**Stats** (`scripts/stats.py`, run at build time, writes `site/stats.json`)
- Overview: days tracked, average shop value (VP), priciest day, total VP offered.
- Per skin: times seen, first and last seen, days since last seen.
- Per tier: share of shop slots (Select…Ultra) next to that tier's share of the catalog.
- Per weapon: share of slots (how often a Vandal shows up, etc.).
- Wishlist: hits so far, last hit, days since the last hit.
- Odds (an estimate): with N shop-eligible skins and 4 slots, a given skin is in today's
  shop with probability ≈ 4/N, and at least one of k wishlist skins shows up within d days
  with probability ≈ 1 − (1 − 4k/N)^d. Label it as assuming uniform picks. Riot's real
  weighting is unknown, so show the observed hit rate next to it once there's enough data.

**Where it shows up**
- Website: a Stats tab built from `stats.json`.
- Discord: `/stats` (summary) and `/stats skin:<name>` (times seen, last seen, odds),
  served by the Worker from `stats.json`.
- Maybe: a monthly recap post on the 1st.

**Milestones**
- [ ] 9. History: `run.py` appends to `history/shop.jsonl`; the workflow commits it.
- [ ] 10. `stats.py` → `site/stats.json`, checked against a small hand-written history.
- [ ] 11. Website Stats tab.
- [ ] 12. Discord `/stats`.

**Open questions**
- Commit history to `main` (simple, one small commit a day) or to a separate `data`
  branch (keeps `main`'s log clean)? Leaning `main`.
- Record Night Market offers too, once that's supported?

## Later (maybe)

- Night market support.
