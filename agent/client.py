"""
Shared Anthropic client factory.

Detects whether ANTHROPIC_API_KEY is a Claude Code OAuth token (sk-ant-oat*)
and sets the correct auth headers automatically.

Usage:
    from agent.client import get_anthropic_client
    client = get_anthropic_client()
"""

import os
import anthropic
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
load_dotenv(Path.home() / ".claude" / ".env")


def get_anthropic_client() -> anthropic.Anthropic:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY not set. Check ~/.claude/.env")

    if key.startswith("sk-ant-oat"):
        # Claude Code OAuth token — needs Bearer auth + beta header
        # NOTE: shares rate limits with the Claude Code session.
        # If you hit 429s frequently, add ANTHROPIC_PROJECT_KEY=sk-ant-api03-...
        # to ~/.claude/.env with a dedicated API key from console.anthropic.com
        return anthropic.Anthropic(
            auth_token=key,
            default_headers={"anthropic-beta": "oauth-2025-04-20"},
            max_retries=3,  # built-in retry with exponential backoff
        )

    # Regular API key from console.anthropic.com
    return anthropic.Anthropic(api_key=key, max_retries=3)


def get_anthropic_client_prefer_project() -> anthropic.Anthropic:
    """
    Prefer a dedicated project API key if set, fall back to OAuth token.
    Set ANTHROPIC_PROJECT_KEY in ~/.claude/.env to avoid rate limit contention
    with the Claude Code session.
    """
    project_key = os.getenv("ANTHROPIC_PROJECT_KEY", "")
    if project_key:
        return anthropic.Anthropic(api_key=project_key, max_retries=3)
    return get_anthropic_client()
