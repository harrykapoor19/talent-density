"""
twitter_monitor.py — Watch target people on Twitter. Fire macOS notification within ~10 min of a post.

The 10-minute hack, productized:
  When a founder/key person posts, the first 10-15 min = highest attention window.
  This module polls their accounts, detects new posts, notifies you instantly,
  and pre-drafts your reply so you can engage while they're watching.

Watchlist stored in: data/twitter_watchlist.json
Seen tweet IDs stored in: data/twitter_seen.json

Usage (standalone):
  python agent/twitter_monitor.py          # run one check cycle
  python agent/twitter_monitor.py --watch  # run in polling loop

Scheduler integration:
  The scheduler polls every 20 min during active windows (6am–10pm PT).
"""

from __future__ import annotations

import os
import sys
import json
import subprocess
import time
from agent.client import get_anthropic_client_prefer_project
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).parent.parent.parent / ".claude" / ".env")

WATCHLIST_PATH = Path(__file__).parent.parent / "data" / "twitter_watchlist.json"
SEEN_PATH = Path(__file__).parent.parent / "data" / "twitter_seen.json"
PROFILE_PATH = Path(__file__).parent.parent / "profile" / "harry.md"

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = get_anthropic_client_prefer_project()
    return _client


# ── Watchlist Management ─────────────────────────────────────────────────────

def load_watchlist() -> list[dict]:
    """
    Load the Twitter watchlist.
    Each entry: {name, twitter_handle, company, context, added_at, patterns}
    """
    if WATCHLIST_PATH.exists():
        return json.loads(WATCHLIST_PATH.read_text())
    return []


def save_watchlist(watchlist: list[dict]):
    WATCHLIST_PATH.write_text(json.dumps(watchlist, indent=2))


def add_to_watchlist(person_name: str, twitter_handle: str, company: str, context: str = "") -> dict:
    """Add a person to the watchlist. Deduplicates by handle."""
    watchlist = load_watchlist()
    handle = twitter_handle.lstrip("@").lower()

    # Check for duplicate
    for entry in watchlist:
        if entry["twitter_handle"].lower() == handle:
            return {"status": "already_watching", "entry": entry}

    entry = {
        "name": person_name,
        "twitter_handle": handle,
        "company": company,
        "context": context,
        "added_at": datetime.now(timezone.utc).isoformat(),
        "patterns": {},       # populated by analyze_patterns()
        "last_checked": None,
        "last_seen_tweet_id": None,
    }
    watchlist.append(entry)
    save_watchlist(watchlist)
    return {"status": "added", "entry": entry}


def remove_from_watchlist(twitter_handle: str) -> bool:
    watchlist = load_watchlist()
    handle = twitter_handle.lstrip("@").lower()
    original = len(watchlist)
    watchlist = [e for e in watchlist if e["twitter_handle"].lower() != handle]
    if len(watchlist) < original:
        save_watchlist(watchlist)
        return True
    return False


# ── Seen Tweets ──────────────────────────────────────────────────────────────

def load_seen() -> dict:
    """Returns {handle: [tweet_ids]} dict."""
    if SEEN_PATH.exists():
        return json.loads(SEEN_PATH.read_text())
    return {}


def save_seen(seen: dict):
    SEEN_PATH.write_text(json.dumps(seen, indent=2))


def mark_seen(handle: str, tweet_ids: list[str]):
    seen = load_seen()
    existing = set(seen.get(handle, []))
    existing.update(tweet_ids)
    # Keep only last 200 per handle to avoid file bloat
    seen[handle] = list(existing)[-200:]
    save_seen(seen)


# ── Twitter Fetching ─────────────────────────────────────────────────────────

def fetch_recent_tweets(handle: str, max_items: int = 10) -> list[dict]:
    """
    Fetch recent tweets for a handle using Apify tweet scraper.
    Returns list of tweet dicts.
    """
    apify_key = os.getenv("APIFY_API_KEY") or os.getenv("APIFY_API_TOKEN")
    if not apify_key:
        return []

    try:
        from apify_client import ApifyClient
        apify = ApifyClient(apify_key)
        run = apify.actor("apidojo/tweet-scraper").call(
            run_input={
                "startUrls": [{"url": f"https://x.com/{handle}"}],
                "maxItems": max_items,
            },
            timeout_secs=90,
        )
        return list(apify.dataset(run["defaultDatasetId"]).iterate_items())
    except Exception as e:
        print(f"  Apify error for @{handle}: {e}")
        return []


def get_tweet_id(tweet: dict) -> Optional[str]:
    return (
        tweet.get("id")
        or tweet.get("id_str")
        or tweet.get("tweetId")
        or tweet.get("tweet_id")
    )


def get_tweet_text(tweet: dict) -> str:
    return (
        tweet.get("text")
        or tweet.get("full_text")
        or tweet.get("content")
        or ""
    )


def get_tweet_url(tweet: dict, handle: str) -> str:
    return (
        tweet.get("url")
        or tweet.get("tweetUrl")
        or f"https://x.com/{handle}/status/{get_tweet_id(tweet) or 'unknown'}"
    )


# ── Notification ─────────────────────────────────────────────────────────────

def notify_macos(title: str, message: str, url: Optional[str] = None):
    """Fire a macOS push notification and optionally open the tweet URL."""
    script = f'display notification "{message}" with title "{title}" sound name "Ping"'
    try:
        subprocess.run(["osascript", "-e", script], check=False)
    except Exception:
        pass

    if url:
        try:
            subprocess.run(["open", url], check=False)
        except Exception:
            pass


# ── Reply Draft ──────────────────────────────────────────────────────────────

def draft_reply(person_name: str, company: str, tweet_text: str, context: str) -> str:
    """Generate a quick reply draft for a specific tweet."""
    profile = PROFILE_PATH.read_text() if PROFILE_PATH.exists() else ""

    prompt = f"""Draft a Twitter reply for Harry Kapoor to post on this tweet.

HARRY'S PROFILE:
{profile}

TWEET by {person_name} ({company}):
"{tweet_text}"

CONTEXT (why Harry is watching this person):
{context or "Harry wants to connect about a potential role at this company"}

Write a reply that:
1. Adds genuine value or a specific insight (not just "great point!")
2. Sounds like a builder/peer, not a fan
3. Is 1-2 sentences max
4. Opens a door for further conversation without being desperate
5. References something SPECIFIC from the tweet

Return ONLY the reply text. No quotes, no explanation."""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


# ── Pattern Analysis ─────────────────────────────────────────────────────────

def analyze_posting_pattern(handle: str) -> dict:
    """
    Analyze a person's historical posting pattern.
    Returns: most_active_days, most_active_hours, avg_gap_hours, predicted_window.
    """
    tweets = fetch_recent_tweets(handle, max_items=40)
    from agent.reach_out import _analyze_posting_pattern
    return _analyze_posting_pattern(tweets)


# ── Core Monitor Loop ────────────────────────────────────────────────────────

def check_watchlist_once(draft_replies: bool = True) -> list[dict]:
    """
    Run one check cycle across the entire watchlist.
    Returns list of new posts found with optional reply drafts.
    """
    watchlist = load_watchlist()
    if not watchlist:
        return []

    seen = load_seen()
    new_posts = []

    for entry in watchlist:
        handle = entry["twitter_handle"]
        name = entry["name"]
        company = entry["company"]
        context = entry.get("context", "")

        print(f"  Checking @{handle} ({name}, {company})...")

        tweets = fetch_recent_tweets(handle, max_items=5)
        if not tweets:
            continue

        known_ids = set(seen.get(handle, []))
        fresh = [t for t in tweets if get_tweet_id(t) not in known_ids]

        if not fresh:
            print(f"    No new posts.")
            continue

        print(f"    {len(fresh)} new post(s)!")

        for tweet in fresh:
            tweet_id = get_tweet_id(tweet)
            tweet_text = get_tweet_text(tweet)
            tweet_url = get_tweet_url(tweet, handle)

            if not tweet_text or len(tweet_text) < 20:
                continue

            # Fire macOS notification
            notif_title = f"Job Agent · @{handle} posted"
            notif_msg = f"{name} ({company}): {tweet_text[:80]}..."
            notify_macos(notif_title, notif_msg, tweet_url)

            # Draft a reply
            reply_draft = ""
            if draft_replies:
                try:
                    reply_draft = draft_reply(name, company, tweet_text, context)
                    print(f"    Draft: {reply_draft}")
                except Exception as e:
                    print(f"    Draft error: {e}")

            new_posts.append({
                "person": name,
                "handle": handle,
                "company": company,
                "tweet_id": tweet_id,
                "tweet_text": tweet_text,
                "tweet_url": tweet_url,
                "reply_draft": reply_draft,
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })

        # Mark all fetched tweet IDs as seen
        all_ids = [get_tweet_id(t) for t in tweets if get_tweet_id(t)]
        mark_seen(handle, all_ids)

        # Update last_checked
        entry["last_checked"] = datetime.now(timezone.utc).isoformat()

    save_watchlist(watchlist)
    return new_posts


def format_watchlist_status() -> str:
    """Format watchlist for display in CLI."""
    watchlist = load_watchlist()
    if not watchlist:
        return "  Watchlist is empty. Use 'add to watchlist' to track someone."

    lines = [f"  Twitter Watchlist — {len(watchlist)} people\n"]
    lines.append(f"  {'─'*55}")

    for entry in watchlist:
        name = entry["name"]
        handle = entry["twitter_handle"]
        company = entry["company"]
        added = entry.get("added_at", "")[:10]
        last_checked = entry.get("last_checked", "never")
        if last_checked and last_checked != "never":
            last_checked = last_checked[:16].replace("T", " ") + " UTC"
        patterns = entry.get("patterns", {})
        active_days = ", ".join(patterns.get("most_active_days", ["?"]))

        lines.append(f"  @{handle}  ·  {name}  ·  {company}")
        lines.append(f"    Added: {added}  ·  Last checked: {last_checked}")
        if active_days and active_days != "?":
            lines.append(f"    Active days: {active_days}")
        context = entry.get("context", "")
        if context:
            lines.append(f"    Why: {context}")
        lines.append(f"  {'─'*55}")

    return "\n".join(lines)


# ── Scheduler Integration ────────────────────────────────────────────────────

def run_twitter_monitor_job():
    """Entry point for APScheduler. Run one check, log results."""
    print(f"\n=== Twitter Monitor ===  {datetime.now().strftime('%H:%M')}")
    new_posts = check_watchlist_once(draft_replies=True)
    if new_posts:
        print(f"  {len(new_posts)} new post(s) found and notifications sent.")
        for p in new_posts:
            print(f"  · @{p['handle']}: {p['tweet_text'][:100]}")
    else:
        print("  No new posts.")
    return new_posts


# ── CLI Entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--watch" in sys.argv:
        print("Watching Twitter... (Ctrl+C to stop)")
        POLL_INTERVAL = 20 * 60  # 20 minutes
        while True:
            run_twitter_monitor_job()
            print(f"\nNext check in {POLL_INTERVAL // 60} min. Sleeping...")
            time.sleep(POLL_INTERVAL)
    else:
        # Single check
        posts = run_twitter_monitor_job()
        if posts:
            print(f"\nNew posts found: {len(posts)}")
            for p in posts:
                print(f"\n@{p['handle']} ({p['person']}, {p['company']}):")
                print(f"  Tweet: {p['tweet_text'][:200]}")
                print(f"  URL: {p['tweet_url']}")
                if p.get("reply_draft"):
                    print(f"  Draft reply: {p['reply_draft']}")
        else:
            print("\nNo new posts in watchlist.")
