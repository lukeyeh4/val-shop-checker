"""One-time: register the /wishlist slash command with your Discord app.

Needs the app's Application ID and bot token (Discord developer portal ->
your app -> General Information / Bot). Run again only if the command changes.
"""
import os
import sys
from getpass import getpass

import requests

COMMANDS = [{
    "name": "wishlist",
    "description": "View or change your VALORANT shop wishlist",
    "options": [
        {"type": 1, "name": "show", "description": "Show your wishlist"},
        {"type": 1, "name": "add", "description": "Add a skin (or a whole line, like Reaver)", "options": [
            {"type": 3, "name": "skin", "description": "e.g. Prime Vandal", "required": True, "autocomplete": True}]},
        {"type": 1, "name": "remove", "description": "Remove a wishlist entry", "options": [
            {"type": 3, "name": "skin", "description": "Pick from your wishlist", "required": True, "autocomplete": True}]},
    ],
}]


def main():
    app_id = os.environ.get("DISCORD_APP_ID") or input("Application ID: ").strip()
    token = os.environ.get("DISCORD_BOT_TOKEN") or getpass("Bot token (input hidden): ").strip()
    resp = requests.put(
        f"https://discord.com/api/v10/applications/{app_id}/commands",
        headers={"Authorization": f"Bot {token}"},
        json=COMMANDS,
        timeout=15,
    )
    if not resp.ok:
        sys.exit(f"Discord said HTTP {resp.status_code}: {resp.text[:300]}")
    print("Registered /wishlist.")
    print(f"Add it to your server: https://discord.com/oauth2/authorize?client_id={app_id}&scope=applications.commands")


if __name__ == "__main__":
    main()
