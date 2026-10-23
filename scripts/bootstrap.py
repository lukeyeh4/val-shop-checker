"""One-time local setup: verify your Riot ssid cookie and print your shop.

How to get the ssid cookie:
  1. Open this URL in a browser and log in:
     https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&nonce=1&scope=account%20openid
  2. On the playvalorant.com page you land on, open DevTools (F12).
  3. Application (Chrome) / Storage (Firefox) -> Cookies -> https://auth.riotgames.com
  4. Copy the full value of the `ssid` cookie.

The ssid cookie is effectively your logged-in Riot account. Don't share it.
Then either paste it at the prompt, or (if you have no interactive terminal)
save it to a file named .ssid in the project root; it's deleted after reading.

On success the cookies are saved to .cookies.json (gitignored) for local runs
and for the RIOT_COOKIES GitHub secret.
"""
import json
import sys
from getpass import getpass
from pathlib import Path

from riot import RiotError, cookies_from_session, fetch_shop, get_access_token, session_from_cookies

COOKIES_FILE = Path(__file__).resolve().parent.parent / ".cookies.json"
SSID_FILE = COOKIES_FILE.with_name(".ssid")


def read_ssid() -> str:
    """From .ssid (deleted after reading) if present, else a hidden prompt."""
    if SSID_FILE.exists():
        ssid = SSID_FILE.read_text().strip()
        SSID_FILE.unlink()
        return ssid
    if not sys.stdin.isatty():
        sys.exit(
            "No terminal to type into. Either run this in Terminal.app, or paste the "
            f"ssid value into {SSID_FILE} and rerun (the file is deleted after use)."
        )
    return getpass("Paste your ssid cookie (input hidden): ").strip()


def main():
    print(__doc__)
    ssid = read_ssid()
    if ssid.lower().startswith("ssid="):
        ssid = ssid.split("=", 1)[1]
    if not ssid:
        sys.exit("No ssid given.")

    session = session_from_cookies({"ssid": ssid})
    access_token = get_access_token(session)
    if access_token is None:
        sys.exit("Riot didn't accept that ssid. Copy it again while logged in.")

    try:
        shop = fetch_shop(session, access_token, region="na")
    except RiotError as e:
        sys.exit(f"Logged in, but fetching the shop failed: {e}")

    print("\nToday's shop:")
    for skin in shop["skins"]:
        print(f"  {skin['name']:<32} {skin['price'] or '?':>5} VP")
    if shop["resets_in"]:
        h, m = divmod(shop["resets_in"] // 60, 60)
        print(f"Resets in {h}h {m}m")

    cookies = cookies_from_session(session)
    COOKIES_FILE.write_text(json.dumps(cookies))
    COOKIES_FILE.chmod(0o600)
    print(f"\nSaved cookies to {COOKIES_FILE}")
    print("For the RIOT_COOKIES GitHub secret, use the contents of that file.")


if __name__ == "__main__":
    main()
