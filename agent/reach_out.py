"""
reach_out.py — Per-person reach-out intelligence.

For a specific person, determines:
  - Best channel (Twitter, LinkedIn, email, Substack, GitHub)
  - Posting pattern (when they're active, when to reach)
  - Predicted next post window
  - Pre-drafted outreach message tuned to their communication style

This extends the personality-profiler skill with tactical "where + when + how" intel.

Usage:
  from agent.reach_out import research_person
  result = research_person("Tom Brown", "Anthropic", twitter_handle="tombrown")
"""

from __future__ import annotations

import os
import json
import httpx
import anthropic
from agent.client import get_anthropic_client
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).parent.parent.parent / ".claude" / ".env")
client = get_anthropic_client()

PROFILE_PATH = Path(__file__).parent.parent / "profile" / "harry.md"
SEEN_PATH = Path(__file__).parent.parent / "data" / "twitter_seen.json"


def _load_profile() -> str:
    if PROFILE_PATH.exists():
        return PROFILE_PATH.read_text()
    return "Harry Kapoor — founder, AI builder, LinkedIn: harrykapoor19"


def _fetch_tweets(twitter_handle: str, max_items: int = 30) -> list[dict]:
    """
    Fetch recent tweets for a handle using Apify tweet scraper.
    Returns list of tweet dicts with text, created_at, engagement.
    """
    apify_key = os.getenv("APIFY_API_KEY") or os.getenv("APIFY_API_TOKEN")
    if not apify_key:
        return []

    handle = twitter_handle.lstrip("@")
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
        items = list(apify.dataset(run["defaultDatasetId"]).iterate_items())
        return items
    except Exception as e:
        return []


def _analyze_posting_pattern(tweets: list[dict]) -> dict:
    """
    Analyze tweet timestamps to find posting patterns.
    Returns: most_active_days, most_active_hours, avg_gap_hours, predicted_next_window.
    """
    if not tweets:
        return {
            "most_active_days": [],
            "most_active_hours": [],
            "avg_gap_hours": None,
            "predicted_window": "Insufficient data",
            "timezone_guess": "Unknown",
            "last_post": None,
        }

    from collections import Counter

    timestamps = []
    for t in tweets:
        # Apify tweet-scraper uses different field names
        created = (
            t.get("created_at")
            or t.get("createdAt")
            or t.get("timestamp")
            or t.get("date")
        )
        if created:
            try:
                if isinstance(created, str):
                    # Handle Twitter's date format
                    for fmt in [
                        "%a %b %d %H:%M:%S +0000 %Y",
                        "%Y-%m-%dT%H:%M:%S.%fZ",
                        "%Y-%m-%dT%H:%M:%SZ",
                        "%Y-%m-%d %H:%M:%S",
                    ]:
                        try:
                            dt = datetime.strptime(created, fmt).replace(tzinfo=timezone.utc)
                            timestamps.append(dt)
                            break
                        except ValueError:
                            continue
                elif isinstance(created, (int, float)):
                    dt = datetime.fromtimestamp(created / 1000 if created > 1e10 else created, tz=timezone.utc)
                    timestamps.append(dt)
            except Exception:
                pass

    if not timestamps:
        return {
            "most_active_days": [],
            "most_active_hours": [],
            "avg_gap_hours": None,
            "predicted_window": "Could not parse timestamps",
            "timezone_guess": "Unknown",
            "last_post": None,
        }

    timestamps.sort(reverse=True)

    # Day of week distribution
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    day_counts = Counter(t.weekday() for t in timestamps)
    top_days = [day_names[d] for d, _ in day_counts.most_common(3)]

    # Hour distribution (UTC)
    hour_counts = Counter(t.hour for t in timestamps)
    top_hours = [f"{h:02d}:00 UTC" for h, _ in hour_counts.most_common(3)]

    # Average gap between posts
    if len(timestamps) >= 2:
        gaps = [(timestamps[i] - timestamps[i + 1]).total_seconds() / 3600 for i in range(len(timestamps) - 1)]
        avg_gap = round(sum(gaps) / len(gaps), 1)
    else:
        avg_gap = None

    last_post = timestamps[0].strftime("%Y-%m-%d %H:%M UTC") if timestamps else None

    # Predict next window
    if avg_gap and timestamps:
        from datetime import timedelta
        predicted_next = timestamps[0] + timedelta(hours=avg_gap)
        predicted_str = predicted_next.strftime("%A %b %d, ~%H:00 UTC")
    else:
        predicted_str = f"Typically posts on {', '.join(top_days)} around {', '.join(top_hours[:1])}"

    return {
        "most_active_days": top_days,
        "most_active_hours": top_hours,
        "avg_gap_hours": avg_gap,
        "predicted_window": predicted_str,
        "timezone_guess": "EST" if top_hours and int(top_hours[0][:2]) in range(12, 16) else "PST" if int(top_hours[0][:2]) in range(15, 20) else "UTC",
        "last_post": last_post,
        "tweet_count_analyzed": len(timestamps),
    }


def _web_research_person(name: str, company: str) -> str:
    """
    Use Claude to research a person and identify their channel presence.
    Returns raw research context string.
    """
    prompt = f"""Research {name} at {company} for outreach intelligence.

Return a JSON object with:
{{
  "summary": "2-sentence who they are",
  "role": "their current role",
  "background": "career arc in 1-2 sentences",
  "communication_style": "direct|storytelling|analytical|casual|academic",
  "primary_channels": [
    {{
      "platform": "twitter|linkedin|email|substack|github|website",
      "handle_or_url": "known handle or URL or null",
      "activity_level": "high|medium|low|unknown",
      "reply_behavior": "replies to strangers|engages comments|rarely replies|unknown"
    }}
  ],
  "twitter_handle": "@handle or null",
  "content_themes": ["topic1", "topic2"],
  "pet_peeves": ["things they've publicly criticized"],
  "recent_activity": "what they've been up to in last 3-6 months",
  "conversation_hooks": ["specific thing to reference in opening message"],
  "best_opener_approach": "specific advice on how to open a message to THIS person"
}}

Use your knowledge about {name} at {company}. If you don't know specific details, say so honestly.
Return ONLY the JSON. No markdown."""

    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def _generate_outreach_draft(
    person_name: str,
    company: str,
    role_context: str,
    person_research: dict,
    channel: str,
    profile: str,
    tweets_sample: Optional[list] = None,
) -> str:
    """Generate a personalized outreach message for this specific person and channel."""

    tweet_context = ""
    if tweets_sample:
        recent = tweets_sample[:5]
        tweet_context = "RECENT TWEETS:\n" + "\n".join(
            f'- "{t.get("text", t.get("full_text", ""))[:200]}"' for t in recent if t.get("text") or t.get("full_text")
        )

    channel_instructions = {
        "twitter_reply": "This is a reply to one of their tweets. 1-2 sentences max. Sound like a real person, not a fan. Add a genuine insight or question.",
        "twitter_dm": "This is a DM after you've already replied to 1-2 of their tweets. 3-5 sentences. Mention the interaction. Make a specific ask.",
        "linkedin_dm": "LinkedIn DM. 60-120 words. Start with 'Hi [Name].' Professional but human. One specific thing you've built + one question about their work.",
        "email": "Cold email. Subject line + 100-150 word body. Very specific opening, one paragraph of credibility, one ask.",
        "substack_comment": "Comment on their latest Substack post. 2-4 sentences. Add genuine value. Don't pitch yourself directly.",
    }.get(channel, "Short, specific, human. No templates.")

    prompt = f"""Write an outreach message for Harry Kapoor to send to {person_name} at {company}.

HARRY'S PROFILE:
{profile}

TARGET: {person_name}
ROLE: {person_research.get("role", "unknown")}
COMPANY: {company}
CONTEXT: {role_context or "Harry wants to connect about a potential PM role"}

ABOUT THIS PERSON:
Summary: {person_research.get("summary", "No data")}
Communication style: {person_research.get("communication_style", "unknown")}
Content themes: {", ".join(person_research.get("content_themes", []))}
Conversation hooks: {json.dumps(person_research.get("conversation_hooks", []))}
Best opener approach: {person_research.get("best_opener_approach", "")}

{tweet_context}

CHANNEL: {channel}
CHANNEL INSTRUCTIONS: {channel_instructions}

RULES:
- Sound like Harry, not a template. Specific, direct, builder energy.
- Reference something REAL about their work or this person specifically.
- Lead with what Harry has built — ONE thing, with a real detail.
- Make the connection between what Harry built and what this person/company is building.
- End with a low-friction ask (reply, quick chat, question).
- NO "I am excited to" / "I am passionate about" / "I would love to"
- NO em dashes
- Be a peer talking to a peer, not a candidate to a gatekeeper.

Return ONLY the message text. For email, also include a subject line prefixed with "Subject: "."""

    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def research_person(
    person_name: str,
    company: str,
    twitter_handle: Optional[str] = None,
    role_context: str = "",
    channel_hint: Optional[str] = None,
) -> dict:
    """
    Full reach-out intelligence for a specific person.

    Returns:
    {
      "person": name,
      "company": company,
      "research": {...Claude profile research...},
      "twitter_patterns": {...posting pattern analysis...},
      "best_channel": "twitter_reply|linkedin_dm|email|...",
      "best_time": "human-readable best time to message",
      "predicted_next_post": "when to expect their next tweet",
      "outreach_drafts": {
        "twitter_reply": "...",
        "linkedin_dm": "...",
        "primary": "...",   # best channel draft
      }
    }
    """
    profile = _load_profile()

    # 1. Web research
    research_raw = _web_research_person(person_name, company)
    try:
        research = json.loads(research_raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', research_raw, re.DOTALL)
        research = json.loads(match.group()) if match else {"summary": research_raw}

    # 2. Twitter handle resolution
    handle = twitter_handle or research.get("twitter_handle")

    # 3. Tweet pattern analysis
    tweets = []
    patterns = {}
    if handle:
        tweets = _fetch_tweets(handle, max_items=30)
        patterns = _analyze_posting_pattern(tweets)

    # 4. Determine best channel
    channels = research.get("primary_channels", [])
    high_activity = [c for c in channels if c.get("activity_level") == "high"]

    if channel_hint:
        best_channel = channel_hint
    elif any(c["platform"] == "twitter" for c in high_activity):
        best_channel = "twitter_reply"
    elif any(c["platform"] == "substack" for c in high_activity):
        best_channel = "substack_comment"
    else:
        best_channel = "linkedin_dm"

    # 5. Best time recommendation
    if patterns.get("predicted_window"):
        best_time = (
            f"Right after they post (predicted: {patterns['predicted_window']}). "
            f"Most active on: {', '.join(patterns.get('most_active_days', []))}"
        )
    else:
        best_time = (
            f"Most active on: {', '.join(patterns.get('most_active_days', ['unknown']))}. "
            f"Peak hours (UTC): {', '.join(patterns.get('most_active_hours', ['unknown']))}"
        )

    # 6. Generate outreach drafts
    drafts = {}
    drafts["primary"] = _generate_outreach_draft(
        person_name, company, role_context, research, best_channel, profile, tweets
    )

    if best_channel != "linkedin_dm":
        drafts["linkedin_dm"] = _generate_outreach_draft(
            person_name, company, role_context, research, "linkedin_dm", profile
        )

    if handle and best_channel not in ("twitter_reply", "twitter_dm"):
        drafts["twitter_reply"] = _generate_outreach_draft(
            person_name, company, role_context, research, "twitter_reply", profile, tweets
        )

    return {
        "person": person_name,
        "company": company,
        "twitter_handle": handle,
        "research": research,
        "twitter_patterns": patterns,
        "best_channel": best_channel,
        "best_time": best_time,
        "outreach_drafts": drafts,
    }


def format_research_output(result: dict) -> str:
    """Format research result for CLI display."""
    r = result.get("research", {})
    p = result.get("twitter_patterns", {})
    drafts = result.get("outreach_drafts", {})

    lines = []
    lines.append(f"{'─'*60}")
    lines.append(f"  {result['person']}  ·  {result['company']}")
    lines.append(f"  {r.get('role', '')}")
    lines.append(f"{'─'*60}")
    lines.append("")
    lines.append(f"  SUMMARY")
    lines.append(f"  {r.get('summary', 'No data')}")
    lines.append("")
    lines.append(f"  BACKGROUND")
    lines.append(f"  {r.get('background', 'No data')}")
    lines.append("")
    lines.append(f"  COMMUNICATION STYLE:  {r.get('communication_style', 'unknown')}")
    lines.append(f"  CONTENT THEMES:       {', '.join(r.get('content_themes', []))}")
    lines.append("")

    if p:
        lines.append(f"  TWITTER ACTIVITY  {result.get('twitter_handle', '')}")
        lines.append(f"  Active days:    {', '.join(p.get('most_active_days', ['?']))}")
        lines.append(f"  Active hours:   {', '.join(p.get('most_active_hours', ['?']))}")
        lines.append(f"  Avg gap:        {p.get('avg_gap_hours', '?')} hrs between posts")
        lines.append(f"  Last post:      {p.get('last_post', '?')}")
        lines.append(f"  Next window:    {p.get('predicted_window', '?')}")
        lines.append("")

    lines.append(f"  BEST CHANNEL:  {result.get('best_channel', '?')}")
    lines.append(f"  BEST TIME:     {result.get('best_time', '?')}")
    lines.append("")

    hooks = r.get("conversation_hooks", [])
    if hooks:
        lines.append("  CONVERSATION HOOKS")
        for h in hooks[:3]:
            lines.append(f"  · {h}")
        lines.append("")

    lines.append(f"  OUTREACH DRAFT  ({result.get('best_channel', 'primary')})")
    lines.append(f"  {'─'*50}")
    primary = drafts.get("primary", "No draft generated")
    for line in primary.split("\n"):
        lines.append(f"  {line}")
    lines.append(f"  {'─'*50}")

    if "linkedin_dm" in drafts and result.get("best_channel") != "linkedin_dm":
        lines.append("")
        lines.append(f"  LINKEDIN BACKUP DRAFT")
        lines.append(f"  {'─'*50}")
        for line in drafts["linkedin_dm"].split("\n"):
            lines.append(f"  {line}")
        lines.append(f"  {'─'*50}")

    lines.append(f"{'─'*60}")
    return "\n".join(lines)
