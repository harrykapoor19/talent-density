"""
network.py — Find the right person to reach at a target company.

Scores candidates on 6 factors (from the targeting framework in the PID):
  1. Role Relevance    (25%) — are they on the relevant team?
  2. Low Inbox Load    (25%) — inverted fame score. Less famous = higher score.
  3. Growth Mindset    (20%) — do they post, help, engage with strangers?
  4. Company Tenure    (15%) — newer joiners (<18 months) are more network-hungry
  5. Profile Match     (10%) — shared background with Harry
  6. Network Distance  ( 5%) — 2nd degree > 3rd degree > cold

The key insight: NOT the CEO. The "hidden gem" — relevant, not famous, growth-minded.

Usage:
  from agent.network import find_people_at_company
  results = find_people_at_company("Anthropic", role_hint="founding PM")
"""

import os
import json
import httpx
from agent.client import get_anthropic_client_prefer_project
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).parent.parent.parent / ".claude" / ".env")

PROFILE_PATH = Path(__file__).parent.parent / "profile" / "harry.md"


def _load_profile() -> str:
    if PROFILE_PATH.exists():
        return PROFILE_PATH.read_text()
    return "Harry Kapoor — founder, AI builder, LinkedIn: harrykapoor19"


def _search_linkedin_people(company_name: str, role_hint: str = "") -> list[dict]:
    """
    DuckDuckGo site:linkedin.com/in search for people at the company.
    Returns raw search results (URL + inferred name).
    """
    query = f'site:linkedin.com/in "{company_name}" {role_hint or "product manager"}'
    try:
        r = httpx.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
            timeout=10,
            follow_redirects=True,
        )
        import re
        urls = re.findall(r'https://(?:www\.)?linkedin\.com/in/([a-zA-Z0-9\-]+)', r.text)
        urls = list(dict.fromkeys(urls))[:12]
        return [
            {
                "url": f"https://linkedin.com/in/{slug}",
                "name": slug.replace("-", " ").title(),
            }
            for slug in urls
        ]
    except Exception:
        return []


def _search_with_apify(company_name: str, role_hint: str = "") -> list[dict]:
    """
    Use Apify LinkedIn People Search actor if available.
    Falls back silently — caller uses web search as fallback.
    """
    apify_key = os.getenv("APIFY_API_KEY") or os.getenv("APIFY_API_TOKEN")
    if not apify_key:
        return []
    try:
        from apify_client import ApifyClient
        apify = ApifyClient(apify_key)
        run = apify.actor("curious_coder/linkedin-people-search").call(
            run_input={
                "searchTerms": [f"{role_hint or 'product manager'} at {company_name}"],
                "maxResults": 12,
            },
            timeout_secs=60,
        )
        return list(apify.dataset(run["defaultDatasetId"]).iterate_items())
    except Exception:
        return []


def _score_people(
    company_name: str,
    raw_results: list[dict],
    role_hint: str,
    profile: str,
) -> list[dict]:
    """
    Use Claude to score and rank people by targeting potential.
    Uses search results + Claude's own knowledge about the company.
    """
    context = json.dumps(raw_results[:12], indent=2) if raw_results else "No direct search results."

    prompt = f"""You are helping Harry Kapoor identify the best people to contact at {company_name}.

HARRY'S PROFILE:
{profile}

TARGET COMPANY: {company_name}
ROLE HE'S TARGETING: {role_hint or "founding PM / product lead / product manager"}

LINKEDIN SEARCH RESULTS (may be partial):
{context}

Your task: Identify and score the TOP 5 people Harry should contact at {company_name}.

TARGETING FRAMEWORK — score each person on:
1. Role Relevance (25pts) — are they on the team relevant to Harry's target role? Can they champion him internally?
2. Low Inbox Load (25pts) — INVERTED fame metric. CEO/co-founder = 0pts. A PM Lead with 800 Twitter followers = 25pts. Less public = higher score.
3. Growth Mindset (20pts) — do they post, engage strangers, share learnings? Signs: "happy to chat DMs open", "here to help", public writing, reply to others.
4. Company Tenure (15pts) — new joiners (<12 months = 15pts, 12-24 months = 10pts, >2 years = 5pts) are more network-hungry.
5. Profile Match (10pts) — shared career arc, industry background, or sector overlap with Harry.
6. Network Distance (5pts) — assume cold unless stated. 2nd degree = 5pts.

TARGET ARCHETYPE: NOT the CEO. NOT the famous co-founder.
IDEAL: A PM Lead, Head of Product, Senior PM, or team lead who:
- Works on the product area Harry wants to work on
- Has <5,000 Twitter followers (not inbox-flooded)
- Joined in the last 12-18 months
- Has signs of being helpful / network-building
- Can vouch for or refer Harry internally

Use your knowledge of {company_name}'s team (from public sources, LinkedIn, Twitter) to identify real people.
Prioritize people you actually know exist over invented names.

Return a JSON array of exactly 5 people, highest target_score first:

[
  {{
    "name": "Full Name",
    "title": "Job Title at {company_name}",
    "company": "{company_name}",
    "linkedin_url": "https://linkedin.com/in/slug or null",
    "twitter_handle": "@handle or null",
    "approx_followers": "estimate or null",
    "tenure_months": "approximate months at {company_name} or null",
    "target_score": 82,
    "score_breakdown": {{
      "role_relevance": 22,
      "low_inbox_load": 22,
      "growth_mindset": 16,
      "company_tenure": 12,
      "profile_match": 7,
      "network_distance": 3
    }},
    "why_target": "2-sentence reason why Harry should reach this specific person",
    "suggested_channel": "twitter_reply|linkedin_dm|email|substack_comment",
    "opening_angle": "1-sentence suggested opening angle based on their work"
  }}
]

Return ONLY the JSON array. No markdown wrapper, no explanation."""

    cl = get_anthropic_client_prefer_project()
    try:
        msg = cl.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2500,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        if "429" in str(e) or "rate_limit" in str(e).lower():
            msg = cl.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2500,
                messages=[{"role": "user", "content": prompt}],
            )
        else:
            raise

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON array from response
        import re
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
        return []


def find_people_at_company(company_name: str, role_hint: str = "") -> list[dict]:
    """
    Find and rank the best people to reach at a target company.

    Returns list of people sorted by target_score descending.
    Each dict has: name, title, target_score, why_target, suggested_channel, opening_angle.
    """
    profile = _load_profile()

    # Try Apify first (richer data), fall back to web search
    raw = _search_with_apify(company_name, role_hint)
    if not raw:
        raw = _search_linkedin_people(company_name, role_hint)

    people = _score_people(company_name, raw, role_hint, profile)
    return sorted(people, key=lambda x: x.get("target_score", 0), reverse=True)


def format_people_output(people: list[dict]) -> str:
    """Format people list for display in the CLI."""
    if not people:
        return "No people found. Try running with a specific role hint."

    lines = []
    for i, p in enumerate(people, 1):
        score = p.get("target_score", 0)
        name = p.get("name", "Unknown")
        title = p.get("title", "")
        channel = p.get("suggested_channel", "linkedin_dm")
        why = p.get("why_target", "")
        angle = p.get("opening_angle", "")
        linkedin = p.get("linkedin_url") or ""
        twitter = p.get("twitter_handle") or ""

        score_bar = "█" * (score // 10) + "░" * (10 - score // 10)
        channel_icon = {
            "twitter_reply": "🐦",
            "linkedin_dm": "💼",
            "email": "📧",
            "substack_comment": "📝",
        }.get(channel, "💬")

        lines.append(f"{'─'*55}")
        lines.append(f"  #{i}  {name}  ·  Target Score: {score}/100  [{score_bar}]")
        lines.append(f"       {title}")
        if linkedin:
            lines.append(f"       LinkedIn: {linkedin}")
        if twitter:
            lines.append(f"       Twitter:  {twitter}")
        lines.append(f"       Channel:  {channel_icon} {channel}")
        lines.append(f"       Why:      {why}")
        lines.append(f"       Angle:    {angle}")

    lines.append(f"{'─'*55}")
    return "\n".join(lines)
