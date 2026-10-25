# val-shop-checker

See your 4 daily VALORANT shop skins on any device (including your phone)
without opening VALORANT.

A GitHub Action runs every day shortly after the shop resets (00:17 UTC, with
backup runs at 00:47 and 02:17 in case GitHub drops one), then:

- publishes a **website** (GitHub Pages) with the skins, prices, a reset
  countdown, and a ★ **wishlist** browser for every skin
- posts the shop to **Discord**, @mentioning you when a wishlist skin is in it

> Uses Riot's unofficial client API. It is not endorsed by Riot and may break
> without notice. Use at your own risk.

## Setup

### 1. Riot session (local, once)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/bootstrap.py
```

Follow the printed steps to copy your `ssid` cookie from auth.riotgames.com.
On success it saves `.cookies.json` (gitignored) and prints your shop.

### 2. Discord

- Webhook: Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
- Your user ID: Settings → Advanced → Developer Mode, then right-click yourself → Copy User ID.
- For local runs, copy `.env.example` to `.env` and fill it in.

### 3. GitHub

Repo **secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `RIOT_COOKIES` | contents of `.cookies.json` |
| `DISCORD_WEBHOOK_URL` | webhook URL |
| `DISCORD_USER_ID` | your Discord user ID |
| `GH_PAT` | *optional*: fine-grained token, this repo only, **Secrets: read and write**. Lets the Action save Riot's refreshed session so it lasts longer. |

Repo **variable** `SITE_URL` = your Pages URL (links Discord posts to the site).

Settings → Pages → Source: **GitHub Actions**. Then Actions → *Valorant Shop* → *Run workflow*.

### 4. Wishlist sync (optional, per device)

Stars on the website save to that browser only, until you tap the sync button
(top right) and paste a fine-grained token: **this repo only, Contents: read and
write**. Stars then commit to `wishlist.txt`, which Discord uses and every device
loads. You can also edit `wishlist.txt` directly; one skin per line, whole-word
and case-insensitive (`Reaver` = every Reaver skin).

### 5. Discord `/wishlist`, `/shop` and `/stats` commands (optional)

`/shop` posts today's shop and `/stats` shows shop statistics and odds
(anyone in the server can use them). `/wishlist show`, `/wishlist add <skin>` and `/wishlist remove <skin>` edit
`wishlist.txt` from Discord, with skin pictures, autocomplete for skin names, and
a warning for limited skins that never show up in the shop. Only you
(`DISCORD_USER_ID`) can use them, and the replies are visible only to you. The command runs on a free Cloudflare Worker
(`discord-bot/`).

1. [Discord developer portal](https://discord.com/developers/applications) →
   **New Application**. Note the **Application ID** and **Public Key**
   (General Information), and copy the **Bot → Reset Token** value.
2. Register the commands and add them to your server:
   `.venv/bin/python scripts/register_commands.py`, then open the link it prints.
3. Deploy the Worker (needs a free Cloudflare account):
   ```bash
   cd discord-bot
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_USER_ID
   npx wrangler secret put GITHUB_TOKEN   # fine-grained, this repo only, Contents: read and write
   ```
4. Paste the `https://val-shop-wishlist.<you>.workers.dev` URL that `deploy` printed into
   the app's **General Information → Interactions Endpoint URL** and save.
   Discord checks it on save.

## Local commands

```bash
.venv/bin/python scripts/run.py               # fetch, build site/index.html, post to Discord
.venv/bin/python scripts/run.py --no-discord  # just build the site
```

## When it breaks

If the Riot session expires, Discord gets a ⚠️ message and the site shows a
banner. Rerun `scripts/bootstrap.py` and update the `RIOT_COOKIES` secret.

## Security

- `ssid` gives full access to your Riot account. It lives only in `.cookies.json`
  (gitignored) and the `RIOT_COOKIES` secret, and is masked in Action logs.
- On a free plan, GitHub Pages needs a **public** repo: secrets stay hidden,
  but the code, the website and `wishlist.txt` are public.
- Website sync tokens are stored in that browser's localStorage. Scope them
  to this repo's Contents only.
