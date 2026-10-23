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
.github/workflows/shop.yml   # cron 5 0 * * * + manual trigger; deploys Pages
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

## Decisions

- **Reset time:** the shop resets at 00:00 UTC, so cron runs at `5 0 * * *`
  (5:05pm PDT / 4:05pm PST).
- **Pages visibility:** on a free plan the repo must be public for Pages.
  Secrets stay hidden, but the page itself is viewable by anyone with the URL.
  Never write tokens or cookies to `site/`.
- **GH_PAT:** a fine-grained token limited to this repo with *Secrets:
  read/write*.

## Later (maybe)

- Night market support.
