#!/usr/bin/env python3
"""
Job Agent CLI — Claude-powered interface for your job search.

Usage:
  python cli.py                                      → interactive chat
  python cli.py "add Anthropic to my target list"   → one-shot

Natural language commands:
  "add Anthropic to my target list"
  "brief me on Cohere"
  "who should I reach at Anthropic for the PM role"
  "profile Dario Amodei at Anthropic"
  "watch @darioamodei on Twitter"
  "check my watchlist"
  "show my pipeline"
  "generate outreach for Tom Brown at Anthropic"
"""

import os
import sys
import json
import readline  # enables arrow key history in REPL
from pathlib import Path
from dotenv import load_dotenv
import anthropic
from agent.client import get_anthropic_client

# Load env: project-local .env first, then ~/.claude/.env as fallback
load_dotenv()
load_dotenv(Path.home() / ".claude" / ".env")

# ── Colors ───────────────────────────────────────────────────────────────────
R = "\033[0m"        # reset
BOLD = "\033[1m"
DIM = "\033[2m"
BLUE = "\033[34m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
RED = "\033[31m"
GRAY = "\033[90m"
WHITE = "\033[97m"


def c(text, *codes):
    return "".join(codes) + str(text) + R


# ── Profile ───────────────────────────────────────────────────────────────────
PROFILE_PATH = Path(__file__).parent / "profile" / "harry.md"
PROFILE = PROFILE_PATH.read_text() if PROFILE_PATH.exists() else "Harry Kapoor — founder, AI builder."

# ── Supabase client (lazy, only if configured) ────────────────────────────────
_supabase = None


def get_db():
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if url and key:
            from supabase import create_client
            _supabase = create_client(url, key)
    return _supabase


# ── System Prompt ─────────────────────────────────────────────────────────────
SYSTEM = f"""You are Job Agent — Harry Kapoor's personal job search intelligence system.
You are direct, efficient, action-oriented. No filler.

HARRY'S PROFILE:
{PROFILE}

YOUR ROLE:
Help Harry run a smart, targeted job search using the tools available to you.
When Harry asks you to do something, call the appropriate tool — don't just explain.

TOOL MAPPING:
- "add X / track X / target X company" → add_target_company
- "who should I reach / find people at / who to contact at X" → find_people
- "brief me on X / what is X / research X company" → brief_company
- "profile [person] / research [person] / tell me about [person]" → research_person
- "watch [person] / add to watchlist / monitor @handle" → add_to_watchlist
- "check watchlist / who posted / any new tweets" → check_watchlist
- "show pipeline / my jobs / what's in my list" → list_pipeline
- "write outreach / draft message / message for [person]" → generate_outreach

RESPONSE STYLE:
- Lead with the most important finding. Skip preamble.
- Use markdown for structured output (bold, bullets, headers).
- After adding a company, suggest the logical next step.
- After finding people, recommend the top person + why.
- After research, give a clear action: "Reply to their tweet tomorrow morning."
- Numbers and specifics > vague adjectives.
"""

# ── Tool Definitions ──────────────────────────────────────────────────────────
TOOLS = [
    {
        "name": "add_target_company",
        "description": "Add a company to the job search target list and run the discovery pipeline to find open roles.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_name": {"type": "string", "description": "Company name"},
                "notes": {"type": "string", "description": "Why this company interests Harry"},
            },
            "required": ["company_name"],
        },
    },
    {
        "name": "list_pipeline",
        "description": "List jobs and companies currently in the pipeline from the database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["open_roles", "radar", "applied", "reached_out", "all"],
                    "description": "Filter by status. Default: all",
                }
            },
        },
    },
    {
        "name": "brief_company",
        "description": "Research a company and return a directional brief: what they do, team structure, relevant roles, culture, fit for Harry.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_name": {"type": "string"},
            },
            "required": ["company_name"],
        },
    },
    {
        "name": "find_people",
        "description": "Find the best people to contact at a company. Returns 5 people ranked by target score (role relevance, inbox load, growth mindset, tenure, profile match).",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_name": {"type": "string"},
                "role_hint": {"type": "string", "description": "Role Harry is targeting, e.g. 'founding PM'"},
            },
            "required": ["company_name"],
        },
    },
    {
        "name": "research_person",
        "description": "Deep research on a specific person: best channel to reach them, posting patterns, predicted active window, and a pre-drafted outreach message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "person_name": {"type": "string"},
                "company": {"type": "string"},
                "twitter_handle": {"type": "string", "description": "Twitter/X handle if known"},
                "role_context": {"type": "string", "description": "Why Harry wants to reach this person"},
            },
            "required": ["person_name", "company"],
        },
    },
    {
        "name": "add_to_watchlist",
        "description": "Add a person to the Twitter activity watchlist. You'll get a macOS notification within ~10 min of their next post.",
        "input_schema": {
            "type": "object",
            "properties": {
                "person_name": {"type": "string"},
                "twitter_handle": {"type": "string", "description": "Twitter handle (without @)"},
                "company": {"type": "string"},
                "context": {"type": "string", "description": "Why Harry is watching this person"},
            },
            "required": ["person_name", "twitter_handle", "company"],
        },
    },
    {
        "name": "check_watchlist",
        "description": "Check the Twitter watchlist for recent posts and get reply drafts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "run_check": {
                    "type": "boolean",
                    "description": "If true, actually poll Twitter for new posts. If false, just show watchlist status.",
                }
            },
        },
    },
    {
        "name": "generate_outreach",
        "description": "Generate a personalized outreach message for a specific person, tuned to their communication style.",
        "input_schema": {
            "type": "object",
            "properties": {
                "person_name": {"type": "string"},
                "company": {"type": "string"},
                "role": {"type": "string", "description": "Role Harry is targeting"},
                "channel": {
                    "type": "string",
                    "enum": ["linkedin_dm", "twitter_reply", "twitter_dm", "email"],
                    "description": "Which channel to write for",
                },
                "person_context": {"type": "string", "description": "What Harry knows about this person"},
            },
            "required": ["person_name", "company"],
        },
    },
]


# ── Tool Implementations ───────────────────────────────────────────────────────

def _tool_add_company(company_name: str, notes: str = "") -> str:
    db = get_db()
    if not db:
        return f"No database configured. Set SUPABASE_URL and SUPABASE_KEY in .env to persist companies."

    # Check if already in DB
    existing = db.table("companies").select("id, name, attention_score").eq("name", company_name).execute().data
    if not existing:
        db.table("companies").insert({
            "name": company_name,
            "source": "manual",
            "skip": False,
        }).execute()
        print(c(f"  → Inserted {company_name} into companies table", DIM, GRAY))
    else:
        print(c(f"  → {company_name} already in DB (score: {existing[0].get('attention_score', 'unscored')})", DIM, GRAY))

    # Run pipeline
    print(c(f"  → Running discovery pipeline for {company_name}...", DIM, GRAY))
    try:
        from agent.pipeline import run_pipeline_for_companies
        result = run_pipeline_for_companies([company_name], rescore=False)

        lines = [f"Pipeline complete for **{company_name}**:"]

        open_roles = result.get("open_roles", [])
        radar = result.get("radar_added", [])
        skipped = result.get("skipped", [])

        if open_roles:
            lines.append(f"\n**{len(open_roles)} open role(s) found:**")
            for r in open_roles[:5]:
                lines.append(f"- {r.get('title', '?')} @ {r.get('company', company_name)}")

        if radar:
            lines.append(f"\n**Added to Radar** (no open roles right now but worth tracking)")

        if skipped:
            lines.append(f"\nSkipped: company score too low (< 40)")

        if not open_roles and not radar and not skipped:
            lines.append("\nNo results yet — may need to check ATS slugs manually.")

        if notes:
            lines.append(f"\nNote: {notes}")

        return "\n".join(lines)

    except Exception as e:
        return f"Pipeline error: {e}. Company added to DB, run pipeline manually."


def _tool_list_pipeline(status: str = "all") -> str:
    db = get_db()
    if not db:
        return "No database configured."

    try:
        q = db.table("jobs").select(
            "company_name, title, attractiveness_score, status, url"
        ).order("attractiveness_score", desc=True, nullsfirst=False)

        if status != "all":
            status_map = {
                "open_roles": "new",
                "applied": "applied",
                "reached_out": "reached_out",
                "radar": None,  # handled separately
            }
            db_status = status_map.get(status)
            if db_status:
                q = q.eq("status", db_status)

        jobs = q.limit(20).execute().data or []

        if not jobs:
            return f"No jobs found (status: {status})."

        lines = [f"**Pipeline ({status})** — {len(jobs)} job(s)\n"]
        for j in jobs:
            score = j.get("attractiveness_score") or 0
            bar = "█" * (score // 10)
            lines.append(f"- **{j.get('title', '?')}** @ {j.get('company_name', '?')}  [{score}/100]  `{j.get('status', '?')}`")

        return "\n".join(lines)

    except Exception as e:
        return f"DB error: {e}"


def _tool_brief_company(company_name: str) -> str:
    db = get_db()
    db_context = ""
    if db:
        rows = db.table("companies").select("*").eq("name", company_name).execute().data
        if rows:
            co = rows[0]
            db_context = f"""
DB data:
- What they do: {co.get('what_they_do', 'not set')}
- Sector: {co.get('sector', 'not set')}
- Stage: {co.get('stage', 'not set')}
- Attention score: {co.get('attention_score', 'unscored')}
"""

    profile = PROFILE
    client_ai = get_anthropic_client()

    prompt = f"""Generate a directional brief on {company_name} for Harry's job search.

HARRY'S PROFILE:
{profile}

{db_context}

Return a structured brief covering:

1. **What they do** — 2-3 sentences. What problem, for whom, how. Be specific.
2. **Team structure** — Which teams exist? Where would a PM work? Is it product-led or eng-led?
3. **Stage & scale** — Funding, headcount, growth signals, recent news.
4. **PM roles** — What kind of PM do they hire? 0-1, scaling, ops? Any open roles visible?
5. **Culture signals** — How do founders/leaders communicate publicly? What do they value?
6. **Fit for Harry** — Honest 2-3 sentence assessment of how well this matches Harry's profile.
7. **Who to reach** — 1-2 sentences on the right person archetype to contact (not "message the CEO").

Be specific and direct. Avoid marketing-speak. Use what you know."""

    msg = client_ai.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def _tool_find_people(company_name: str, role_hint: str = "") -> str:
    try:
        from agent.network import find_people_at_company, format_people_output
        people = find_people_at_company(company_name, role_hint)
        if not people:
            return f"No people found for {company_name}. Try adding a more specific role_hint."
        return format_people_output(people)
    except Exception as e:
        return f"Network search error: {e}"


def _tool_research_person(
    person_name: str,
    company: str,
    twitter_handle=None,
    role_context: str = "",
) -> str:
    try:
        from agent.reach_out import research_person, format_research_output
        result = research_person(person_name, company, twitter_handle, role_context)
        return format_research_output(result)
    except Exception as e:
        return f"Research error: {e}"


def _tool_add_watchlist(person_name: str, twitter_handle: str, company: str, context: str = "") -> str:
    try:
        from agent.twitter_monitor import add_to_watchlist, analyze_posting_pattern
        result = add_to_watchlist(person_name, twitter_handle, company, context)

        if result["status"] == "already_watching":
            return f"Already watching @{twitter_handle}."

        # Optionally analyze patterns right away
        print(c(f"  → Analyzing @{twitter_handle} posting patterns...", DIM, GRAY))
        try:
            patterns = analyze_posting_pattern(twitter_handle)
            # Store patterns back to watchlist
            from agent.twitter_monitor import load_watchlist, save_watchlist
            watchlist = load_watchlist()
            for entry in watchlist:
                if entry["twitter_handle"].lower() == twitter_handle.lstrip("@").lower():
                    entry["patterns"] = patterns
            save_watchlist(watchlist)

            days = ", ".join(patterns.get("most_active_days", []))
            hours = ", ".join(patterns.get("most_active_hours", []))
            predicted = patterns.get("predicted_window", "unknown")
            return (
                f"Added @{twitter_handle} ({person_name}, {company}) to watchlist.\n\n"
                f"**Posting patterns:**\n"
                f"- Most active days: {days or 'insufficient data'}\n"
                f"- Peak hours (UTC): {hours or 'insufficient data'}\n"
                f"- Predicted next post: {predicted}\n\n"
                f"Run `python scheduler.py` to start monitoring (fires macOS notification within ~20 min of a new post)."
            )
        except Exception:
            return (
                f"Added @{twitter_handle} ({person_name}, {company}) to watchlist.\n"
                f"Could not fetch posting patterns — will analyze on first monitor run.\n"
                f"Run `python scheduler.py` to start monitoring."
            )
    except Exception as e:
        return f"Watchlist error: {e}"


def _tool_check_watchlist(run_check: bool = False) -> str:
    try:
        from agent.twitter_monitor import format_watchlist_status, check_watchlist_once
        if run_check:
            print(c("  → Checking Twitter for new posts...", DIM, GRAY))
            new_posts = check_watchlist_once(draft_replies=True)
            status = format_watchlist_status()
            if new_posts:
                lines = [f"**{len(new_posts)} new post(s) found:**\n"]
                for p in new_posts:
                    lines.append(f"**@{p['handle']}** ({p['person']}, {p['company']}):")
                    lines.append(f"> {p['tweet_text'][:200]}")
                    lines.append(f"URL: {p['tweet_url']}")
                    if p.get("reply_draft"):
                        lines.append(f"\nDraft reply: _{p['reply_draft']}_")
                    lines.append("")
                return "\n".join(lines) + "\n\n" + status
            else:
                return "No new posts.\n\n" + status
        else:
            return format_watchlist_status()
    except Exception as e:
        return f"Watchlist error: {e}"


def _tool_generate_outreach(
    person_name: str,
    company: str,
    role: str = "",
    channel: str = "linkedin_dm",
    person_context: str = "",
) -> str:
    try:
        from agent.reach_out import _generate_outreach_draft

        # Minimal research context
        research = {
            "summary": f"{person_name} at {company}",
            "role": role or "team member",
            "communication_style": "unknown",
            "content_themes": [],
            "conversation_hooks": [],
            "best_opener_approach": person_context or "Lead with what you've built, connect to what they're building.",
        }

        draft = _generate_outreach_draft(
            person_name, company, role, research, channel, PROFILE
        )

        return f"**Outreach draft ({channel}):**\n\n{draft}"
    except Exception as e:
        return f"Outreach error: {e}"


# ── Tool Dispatcher ────────────────────────────────────────────────────────────

def execute_tool(name: str, inputs: dict) -> str:
    """Run a tool and return string result for Claude."""
    args_str = ", ".join(f"{k}={repr(v)}" for k, v in inputs.items())
    print(c(f"\n  ⚙  {name}({args_str})", DIM, GRAY))

    try:
        if name == "add_target_company":
            return _tool_add_company(inputs["company_name"], inputs.get("notes", ""))

        elif name == "list_pipeline":
            return _tool_list_pipeline(inputs.get("status", "all"))

        elif name == "brief_company":
            return _tool_brief_company(inputs["company_name"])

        elif name == "find_people":
            return _tool_find_people(inputs["company_name"], inputs.get("role_hint", ""))

        elif name == "research_person":
            return _tool_research_person(
                inputs["person_name"],
                inputs["company"],
                inputs.get("twitter_handle"),
                inputs.get("role_context", ""),
            )

        elif name == "add_to_watchlist":
            return _tool_add_watchlist(
                inputs["person_name"],
                inputs["twitter_handle"],
                inputs["company"],
                inputs.get("context", ""),
            )

        elif name == "check_watchlist":
            return _tool_check_watchlist(inputs.get("run_check", False))

        elif name == "generate_outreach":
            return _tool_generate_outreach(
                inputs["person_name"],
                inputs["company"],
                inputs.get("role", ""),
                inputs.get("channel", "linkedin_dm"),
                inputs.get("person_context", ""),
            )

        else:
            return f"Unknown tool: {name}"

    except Exception as e:
        return f"Tool error [{name}]: {e}"


# ── Agentic Loop ───────────────────────────────────────────────────────────────

claude = get_anthropic_client()


def run_turn(messages: list) -> list:
    """
    Run one turn of the Claude agentic loop.
    Handles multi-step tool calls until Claude returns a final text response.
    Returns updated messages list.
    """
    while True:
        response = claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

        # Append assistant response to history
        messages.append({"role": "assistant", "content": response.content})

        # Print any text blocks
        for block in response.content:
            if hasattr(block, "text") and block.text.strip():
                print(c("\n", R) + block.text)

        # If no tool calls, we're done
        if response.stop_reason != "tool_use":
            break

        # Execute all tool calls in this response
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        # Feed results back to Claude
        messages.append({"role": "user", "content": tool_results})

    return messages


# ── CLI Entrypoints ────────────────────────────────────────────────────────────

def print_header():
    print()
    print(c("  ╭──────────────────────────────────────╮", BOLD, CYAN))
    print(c("  │  Job Agent  ·  Harry Kapoor           │", BOLD, CYAN))
    print(c("  │  Claude-powered job search CLI        │", DIM, CYAN))
    print(c("  ╰──────────────────────────────────────╯", BOLD, CYAN))
    print()
    db_ok = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"))
    apify_ok = bool(os.getenv("APIFY_API_KEY") or os.getenv("APIFY_API_TOKEN"))
    print(f"  DB:     {'✓ connected' if db_ok else c('✗ not configured (set SUPABASE_URL + SUPABASE_KEY)', RED)}")
    print(f"  Apify:  {'✓ connected' if apify_ok else c('✗ not configured (set APIFY_API_KEY)', YELLOW)}")
    print()
    print(c("  Examples:", DIM))
    print(c("    add Anthropic to my target list", DIM))
    print(c("    who should I reach at Cohere for a founding PM role", DIM))
    print(c("    profile Dario Amodei at Anthropic", DIM))
    print(c("    watch @darioamodei at Anthropic", DIM))
    print(c("    check my watchlist", DIM))
    print()


def interactive():
    """Run the interactive REPL."""
    print_header()
    messages = []

    while True:
        try:
            user_input = input(c("  > ", BOLD, GREEN)).strip()
        except (EOFError, KeyboardInterrupt):
            print(c("\n  Goodbye.", DIM))
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            print(c("  Goodbye.", DIM))
            break

        messages.append({"role": "user", "content": user_input})
        try:
            messages = run_turn(messages)
        except Exception as e:
            print(c(f"\n  Error: {e}", RED))
        print()


def one_shot(command: str):
    """Run a single command and exit."""
    messages = [{"role": "user", "content": command}]
    try:
        run_turn(messages)
    except Exception as e:
        print(c(f"Error: {e}", RED))
        sys.exit(1)


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = " ".join(sys.argv[1:])
        one_shot(command)
    else:
        interactive()
