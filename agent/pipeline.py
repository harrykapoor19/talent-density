"""
pipeline.py — Full end-to-end pipeline for a targeted list of companies.

Sequence:
  1. Score company (attention score) — skip if < 55
  2. Poll Ashby / Greenhouse for open roles (if company has slugs)
  3. Roles found   → score each role  → appear in Open Roles
  4. No roles      → generate outreach draft → appear in On Radar

Call run_pipeline_for_companies(names) with a list of company names that are
already in the companies table.
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

RADAR_THRESHOLD = 55


def run_pipeline_for_companies(company_names: list) -> dict:
    """
    Run the full pipeline for a specific list of companies (by name).

    Returns:
        {
            "open_roles":  [{"company": str, "title": str}],
            "radar_added": [{"company": str, "score": int}],
            "skipped":     [{"company": str, "score": int}],
        }
    """
    from agent.discover_from_rss import score_company_for_radar, generate_relationship_message
    from agent.discover import poll_specific_companies
    from agent.score import score_new_jobs

    results: dict = {"open_roles": [], "radar_added": [], "skipped": []}

    for name in company_names:
        try:
            rows = supabase.table("companies").select("*").eq("name", name).execute().data or []
            if not rows:
                continue
            co = rows[0]

            what         = co.get("what_they_do") or ""
            ashby_slug   = co.get("ashby_slug")
            greenhouse_slug = co.get("greenhouse_slug")
            attn         = co.get("attention_score")

            # ── Step 1: Score company if not already scored ──────────────────
            if attn is None:
                scored = score_company_for_radar(
                    name,
                    co.get("funding_info") or "",
                    what,
                )
                attn = scored.get("attention_score", 0)
                updates: dict = {"attention_score": attn}
                if scored.get("what_they_do"):
                    updates["what_they_do"] = scored["what_they_do"]
                    what = scored["what_they_do"]
                if scored.get("sector"):
                    updates["sector"] = scored["sector"]
                if scored.get("stage"):
                    updates["stage"] = scored["stage"]
                supabase.table("companies").update(updates).eq("id", co["id"]).execute()

            # ── Step 2: Skip low-scoring companies ───────────────────────────
            if attn < RADAR_THRESHOLD:
                results["skipped"].append({"company": name, "score": attn})
                continue

            # ── Step 3: Poll for open roles ───────────────────────────────────
            roles = []
            if ashby_slug or greenhouse_slug:
                roles = poll_specific_companies(
                    ashby_slugs=[ashby_slug] if ashby_slug else [],
                    greenhouse_slugs=[greenhouse_slug] if greenhouse_slug else [],
                )

            if roles:
                # ── Step 4a: Score new roles → Open Roles ─────────────────────
                score_new_jobs(limit=50)
                results["open_roles"].extend(roles)
            else:
                # ── Step 4b: No open roles → On Radar + outreach draft ────────
                if not co.get("relationship_message"):
                    draft = generate_relationship_message(
                        name,
                        what,
                        co.get("funding_info") or "",
                    )
                    supabase.table("companies").update(
                        {"relationship_message": draft}
                    ).eq("id", co["id"]).execute()
                results["radar_added"].append({"company": name, "score": attn})

        except Exception:
            pass

    return results
