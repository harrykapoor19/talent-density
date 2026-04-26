"""
FastAPI backend for job agent operations that require Python:
- ATS analysis (Claude Haiku)
- Pipeline run trigger
"""

import os
import sys
import subprocess
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Make sure agent modules are importable
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from agent.ats import analyze_ats
from agent.client import get_anthropic_client
from supabase import create_client

app = FastAPI(title="Job Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    return create_client(url, key)

def get_user_supabase(authorization: Optional[str] = Header(None)):
    """Return a Supabase client scoped to the user's JWT so RLS applies."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    client = create_client(url, key)
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        client.postgrest.auth(token)
    return client

async def require_user(authorization: Optional[str] = Header(None)) -> str:
    """Validate JWT and return user_id. Raises 401 if missing/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = authorization.split(" ", 1)[1]
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    client = create_client(url, key)
    try:
        user = client.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


class AtsRequest(BaseModel):
    job_id: str
    title: str
    company: str
    jd_text: Optional[str] = None


@app.post("/api/ats")
async def run_ats(req: AtsRequest):
    """Run ATS analysis for a job and save the result to Supabase."""
    if not req.jd_text or not req.jd_text.strip():
        raise HTTPException(status_code=400, detail="No JD text provided")

    result = analyze_ats(req.title, req.company, req.jd_text)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    # Save to Supabase
    try:
        sb = get_supabase()
        job_row = sb.table("jobs").select("score_breakdown").eq("id", req.job_id).single().execute()
        existing_sb = job_row.data.get("score_breakdown") or {}
        new_sb = {**existing_sb, "ats_report": result}
        sb.table("jobs").update({"score_breakdown": new_sb}).eq("id", req.job_id).execute()
    except Exception as e:
        # Don't fail the request if save fails — return result anyway
        print(f"Warning: could not save ATS result to Supabase: {e}")

    return result


@app.post("/api/pipeline/run")
async def run_pipeline():
    """Trigger the scoring pipeline (runs main.py in background)."""
    try:
        result = subprocess.run(
            [sys.executable, str(ROOT / "main.py"), "--run-once"],
            capture_output=True,
            text=True,
            timeout=300,
            cwd=str(ROOT),
        )
        return {
            "status": "ok" if result.returncode == 0 else "error",
            "returncode": result.returncode,
            "stdout": result.stdout[-3000:] if result.stdout else "",
            "stderr": result.stderr[-1000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "message": "Pipeline is still running in background"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


class RadarDraftRequest(BaseModel):
    company_id: str
    company: str
    what_they_do: Optional[str] = None


@app.post("/api/radar/generate-draft")
async def generate_radar_draft(req: RadarDraftRequest):
    """Generate an outreach draft for an On Radar company using Claude Sonnet."""
    cl = get_anthropic_client()
    what = req.what_they_do or ""
    gen = cl.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=250,
        messages=[{"role": "user", "content": f"""Write a short LinkedIn message from Rachita Kumar to someone at {req.company}.

What {req.company} does: {what}

Rachita's background: Senior PM at PayPal (shipped App Switch, PayPal's first mobile checkout, +450bps CVR, $50M TPV). Founding PM at TruthSeek (voice AI startup, designed LLM interview agent, ran eval pipelines, delivered live CPG consumer research). Finance background (PE/IB India). Builder: ships solo AI products.

STYLE — match these real messages exactly:
"Hi Dhwani! As the founding PM of a voice AI startup, I ran evals on conversation quality (follow-up questions, staying on topic, goal coverage). But standard benchmarks measure one response at a time. For Cartesia's SSMs, how do you do evals for a 30-minute call or when a user talks over the agent?"

"Hi Michael, I'm a PM at PayPal and was the founding team PM at a voice AI user research startup (TruthSeek). While building TruthSeek, I realized that getting enterprises to trust AI-led workflows in regulated industries isn't a sales problem, it's a product design problem."

Rules:
- Start with "Hi [Name]." (first name only, keep the period)
- Lead with a specific observation about their product or domain, OR a concrete parallel from her work
- ONE experience with real detail, not a list
- End with: "would love to connect" or "would love to chat"
- NEVER mention applying for a job or looking for a role
- NEVER use em dashes or hyphens as dashes
- 60-120 words, conversational

Return ONLY the message."""}]
    ).content[0].text.strip()

    try:
        sb = get_supabase()
        sb.table("companies").update({"relationship_message": gen}).eq("id", req.company_id).execute()
    except Exception as e:
        print(f"Warning: could not save draft: {e}")

    return {"message": gen}


class PrepRequest(BaseModel):
    job_id: str
    company_name: str
    title: str
    jd_text: Optional[str] = None
    score_breakdown: Optional[dict] = None


@app.post("/api/pipeline/generate-prep")
async def generate_pipeline_prep(req: PrepRequest):
    """Generate an outreach message for a pipeline job using agent/prep.py logic."""
    from agent.prep import generate_outreach, save_prep
    job = {
        "id": req.job_id,
        "company_name": req.company_name,
        "title": req.title,
        "jd_text": req.jd_text or "",
        "score_breakdown": req.score_breakdown or {},
    }
    try:
        msg = generate_outreach(job)
        save_prep(req.job_id, msg)
        return {
            "outreach_message": msg,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ExtractPostRequest(BaseModel):
    text: str


@app.post("/api/sources/extract-post")
async def extract_post(req: ExtractPostRequest):
    """Extract company names from a LinkedIn post and add them to the database."""
    try:
        from agent.discover_from_post import process_post
        result = process_post(text=req.text.strip())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_scan_jobs: dict = {}

@app.post("/api/sources/funding-scan")
async def funding_scan():
    """Scan TechCrunch and Next Play RSS for new companies (background)."""
    import threading, uuid
    job_id = str(uuid.uuid4())[:8]
    _scan_jobs[job_id] = {"status": "running", "result": None}

    def _run():
        try:
            from agent.discover_from_rss import extract_companies_from_rss
            companies = extract_companies_from_rss()
            _scan_jobs[job_id] = {"status": "done", "result": {"companies": companies or [], "count": len(companies or [])}}
        except Exception as e:
            _scan_jobs[job_id] = {"status": "error", "result": {"error": str(e)}}

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job_id, "status": "running"}


@app.get("/api/sources/funding-scan/status/{job_id}")
async def funding_scan_status(job_id: str):
    job = _scan_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


class AddInputRequest(BaseModel):
    input: str


@app.post("/api/sources/add")
async def add_companies(req: AddInputRequest):
    """
    Add company names or job URLs to the dashboard.
    Company names -> added to companies table, queued for pipeline.
    Job URLs (Ashby/Greenhouse) -> extracted and added directly to jobs table.
    """
    import re as _re
    import httpx as _httpx
    import anthropic as _anthropic

    lines = [l.strip() for l in _re.split(r"[\n,]+", req.input) if l.strip()]
    urls = [l for l in lines if l.startswith("http")]
    names = [l for l in lines if not l.startswith("http")]

    jobs_added = []
    jobs_failed = []
    companies_added = []
    companies_existing = []

    sb = get_supabase()

    # Handle job URLs
    for jurl in urls:
        try:
            co_name, title, summary = None, None, ""

            ashby_m = _re.match(r"https://jobs\.ashbyhq\.com/([^/]+)/([^/?]+)", jurl)
            gh_m = _re.match(r"https://boards\.greenhouse\.io/([^/]+)/jobs/(\d+)", jurl)

            if ashby_m:
                slug, job_id = ashby_m.group(1), ashby_m.group(2)
                api = _httpx.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}", timeout=8)
                jobs_list = api.json().get("jobs", [])
                match = next((j for j in jobs_list if j.get("id") == job_id or job_id in j.get("jobUrl", "")), None)
                if match:
                    co_name = match.get("companyName") or slug.replace("-", " ").title()
                    title = match.get("title", "")
                    summary = (match.get("descriptionPlain") or "")[:1000]
                else:
                    co_name = slug.replace("-", " ").title()
                    title = "Role from Ashby"
            elif gh_m:
                slug, job_id = gh_m.group(1), gh_m.group(2)
                api = _httpx.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{job_id}", timeout=8)
                jdata = api.json()
                co_name = jdata.get("company", {}).get("name") or slug.replace("-", " ").title()
                title = jdata.get("title", "")
                summary = _re.sub(r"<[^>]+>", " ", jdata.get("content") or "")[:1000]
            else:
                r = _httpx.get(jurl, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True, timeout=10)
                html = _re.sub(r"<(script|style)[^>]*>.*?</(script|style)>", " ", r.text, flags=_re.DOTALL | _re.IGNORECASE)
                page_text = _re.sub(r"\s+", " ", _re.sub(r"<[^>]+>", " ", html)).strip()[:5000]
                cl = get_anthropic_client()
                msg = cl.messages.create(
                    model="claude-haiku-4-5-20251001", max_tokens=200,
                    messages=[{"role": "user", "content": f'Extract job info. Return ONLY JSON: {{"company":"...","title":"...","summary":"..."}}\n\n{page_text}'}],
                )
                import json as _json
                job_info = _json.loads(msg.content[0].text.strip())
                co_name = job_info.get("company", "Unknown")
                title = job_info.get("title", "Unknown Role")
                summary = job_info.get("summary", "")

            # Ensure company exists
            co_res = sb.table("companies").select("id").ilike("name", co_name).execute()
            if not co_res.data:
                sb.table("companies").insert({"name": co_name, "source": "manual", "attention_score": 80}).execute()
            co_id_res = sb.table("companies").select("id").ilike("name", co_name).execute()
            co_id = co_id_res.data[0]["id"] if co_id_res.data else None

            existing = sb.table("jobs").select("id").eq("url", jurl).execute()
            if existing.data:
                jobs_added.append(f"{co_name} — {title} (already in Open Roles)")
            else:
                sb.table("jobs").insert({
                    "company_name": co_name, "company_id": co_id,
                    "title": title, "url": jurl, "jd_text": summary,
                    "source": "manual", "attractiveness_score": 80,
                    "status": "new", "seniority_pass": True, "no_list_pass": True,
                }).execute()
                jobs_added.append(f"{co_name} — {title}")
        except Exception as e:
            jobs_failed.append(f"{jurl}: {str(e)[:80]}")

    # Handle company names — add then immediately run full pipeline
    workflow_result = None
    if names:
        try:
            from agent.discover_from_post import process_post
            result = process_post(text=", ".join(names))
            companies_added = result.get("added", [])
            companies_existing = result.get("already_known", [])
            # Boost attention score so pipeline doesn't skip them
            all_to_run = companies_added + companies_existing
            for name in all_to_run:
                try:
                    sb.table("companies").update({"attention_score": 85}).eq("name", name).execute()
                except Exception:
                    pass
            # Run full pipeline: score → find jobs → Open Roles or Radar
            # rescore=True: re-scores with latest rubric even if company already has a score
            if all_to_run:
                from agent.pipeline import run_pipeline_for_companies
                workflow_result = run_pipeline_for_companies(all_to_run, rescore=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return {
        "jobs_added": jobs_added,
        "jobs_failed": jobs_failed,
        "companies_added": companies_added,
        "companies_existing": companies_existing,
        "workflow": workflow_result,
    }


class RunForCompaniesRequest(BaseModel):
    companies: list


# In-memory store for background pipeline results
_pipeline_jobs: dict = {}

@app.post("/api/pipeline/run-for-companies")
async def run_for_companies(req: RunForCompaniesRequest):
    """Run the scoring pipeline for a specific list of company names (background)."""
    import threading, uuid
    job_id = str(uuid.uuid4())[:8]
    _pipeline_jobs[job_id] = {"status": "running", "total": len(req.companies), "result": None}

    def _run():
        try:
            from agent.pipeline import run_pipeline_for_companies
            result = run_pipeline_for_companies(req.companies, rescore=True)
            _pipeline_jobs[job_id] = {"status": "done", "total": len(req.companies), "result": result}
        except Exception as e:
            _pipeline_jobs[job_id] = {"status": "error", "total": len(req.companies), "result": {"error": str(e)}}

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job_id, "status": "running", "total": len(req.companies)}


@app.get("/api/pipeline/status/{job_id}")
async def pipeline_status(job_id: str):
    """Check status of a background pipeline run."""
    job = _pipeline_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


class RoadmapRequest(BaseModel):
    company_name: str


@app.post("/api/roadmap/predict")
async def predict_roadmap(req: RoadmapRequest):
    """Predict 12-24 month roadmap of a company from all JDs we've seen for it."""
    from agent.client import get_anthropic_client
    import json as _json

    name = (req.company_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="company_name required")

    sb = get_supabase()

    # Lookup company (case-insensitive)
    co_res = sb.table("companies").select(
        "id, name, what_they_do, sector, stage, funding_info"
    ).ilike("name", name).execute()
    company = co_res.data[0] if co_res.data else None
    canonical_name = company["name"] if company else name

    # Pull every JD we have for this company
    jobs_res = sb.table("jobs").select(
        "title, jd_text, source, url, created_at"
    ).ilike("company_name", canonical_name).order("created_at", desc=True).execute()
    jobs = jobs_res.data or []

    if not jobs:
        raise HTTPException(
            status_code=404,
            detail=f"No JDs in our database for '{canonical_name}'. Add the company on the Sources tab first so we can pull its open roles."
        )

    # Build compact corpus — cap each JD so the prompt stays bounded
    lines = []
    for j in jobs:
        title = (j.get("title") or "").strip()
        jd = (j.get("jd_text") or "").strip()
        if not title and not jd:
            continue
        snippet = jd[:1200].replace("\n\n", "\n")
        lines.append(f"### {title}\nSource: {j.get('source') or 'unknown'}\n{snippet}")
    corpus = "\n\n".join(lines)[:60000]  # ~15k tokens cap

    company_context = ""
    if company:
        ctx_bits = [
            f"What they do: {company.get('what_they_do')}" if company.get("what_they_do") else None,
            f"Sector: {company.get('sector')}" if company.get("sector") else None,
            f"Stage: {company.get('stage')}" if company.get("stage") else None,
            f"Funding: {company.get('funding_info')}" if company.get("funding_info") else None,
        ]
        company_context = "\n".join([b for b in ctx_bits if b])

    prompt = f"""You are a former product strategist analysing what a company is building NEXT, based on the open roles they are hiring for.

Company: {canonical_name}
{company_context}

Below are {len(jobs)} job descriptions this company has posted recently. Read them as signal — every JD is the company telling the world what they need to build the next version of the product.

{corpus}

Return ONLY a JSON object with this exact shape:
{{
  "thesis": "2-3 sentence punchy thesis on where this company is heading in the next 12-24 months. No filler. Quote specific role evidence.",
  "product_bets": [
    {{"bet": "short title", "evidence": "1-2 sentences citing specific roles/JD phrases", "confidence": "high|medium|low"}},
    ...3-5 bets total
  ],
  "team_scaling": {{
    "headline": "one sentence on the team-build pattern (e.g. 'GTM-heavy hire', 'doubling down on infra', 'first design hires')",
    "by_function": [
      {{"function": "Engineering|Product|Design|GTM|Ops|Research|Other", "count": 0, "signal": "what this volume tells us"}}
    ]
  }},
  "geographic_moves": "1-2 sentences. If JDs hint at new markets/offices, name them. If everything is one HQ, say so.",
  "tech_signals": ["bullet 1", "bullet 2", "bullet 3"],
  "strategic_priorities": [
    {{"priority": "short title", "reasoning": "why this is the priority based on JD evidence"}},
    ...3-5 priorities
  ],
  "risks_or_gaps": "1-2 sentences on what they are NOT hiring for that you'd expect — telling absences.",
  "next_milestone_guess": "1 sentence — concrete prediction of their next public milestone (launch, Series X, geography, partnership)"
}}

Hard rules:
- Cite specific JD evidence (titles, exact phrases). No generic startup-speak.
- If the JD set is too thin to support a section, say so honestly in that field rather than inventing.
- Output JSON only, no preamble, no markdown fences."""

    try:
        cl = get_anthropic_client()
        # Haiku 4.5 first (cheaper, plenty for structured JD summarization);
        # fall back to Sonnet only if Haiku rate-limits.
        try:
            msg = cl.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2500,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as primary_err:
            if "429" in str(primary_err) or "rate_limit" in str(primary_err).lower():
                msg = cl.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=2500,
                    messages=[{"role": "user", "content": prompt}],
                )
            else:
                raise
        raw = msg.content[0].text.strip()
        # Defensive: strip markdown fences if Claude adds them despite instructions
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            if raw.startswith("json"):
                raw = raw[4:].lstrip()
        roadmap = _json.loads(raw)
    except _json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Model returned non-JSON: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])

    return {
        "company": canonical_name,
        "jobs_analyzed": len(jobs),
        "job_titles": [j.get("title") for j in jobs if j.get("title")][:50],
        "roadmap": roadmap,
    }


# ── Network Intelligence ─────────────────────────────────────────────────────

class FindPeopleRequest(BaseModel):
    company_name: str
    role_hint: str = ""

class AddToWatchlistRequest(BaseModel):
    person_name: str
    twitter_handle: str
    company: str
    context: str = ""

class RemoveFromWatchlistRequest(BaseModel):
    twitter_handle: str

_network_jobs: dict = {}
_check_jobs: dict = {}

@app.post("/api/network/find-people")
async def find_people(req: FindPeopleRequest):
    """Find and score people to contact at a company (background job)."""
    import threading, uuid
    job_id = str(uuid.uuid4())[:8]
    _network_jobs[job_id] = {"status": "running", "result": None}

    def _run():
        try:
            from agent.network import find_people_at_company
            people = find_people_at_company(req.company_name, req.role_hint)
            _network_jobs[job_id] = {"status": "done", "result": people}
        except Exception as e:
            _network_jobs[job_id] = {"status": "error", "result": {"error": str(e)}}

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job_id, "status": "running"}

@app.get("/api/network/find-people/status/{job_id}")
async def find_people_status(job_id: str):
    job = _network_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/api/network/watchlist")
async def get_watchlist():
    """Load the Twitter watchlist from file."""
    try:
        from agent.twitter_monitor import load_watchlist
        return {"watchlist": load_watchlist()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/network/watchlist/add")
async def add_to_watchlist(req: AddToWatchlistRequest):
    """Add a person to the Twitter watchlist."""
    try:
        from agent.twitter_monitor import add_to_watchlist as _add
        result = _add(req.person_name, req.twitter_handle, req.company, req.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/network/watchlist/remove")
async def remove_from_watchlist(req: RemoveFromWatchlistRequest):
    """Remove a person from the Twitter watchlist."""
    try:
        from agent.twitter_monitor import remove_from_watchlist as _remove
        removed = _remove(req.twitter_handle)
        return {"removed": removed}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/network/watchlist/check")
async def check_watchlist():
    """Run one Apify check cycle across the watchlist (background job)."""
    import threading, uuid
    job_id = str(uuid.uuid4())[:8]
    _check_jobs[job_id] = {"status": "running", "result": None}

    def _run():
        try:
            from agent.twitter_monitor import check_watchlist_once
            new_posts = check_watchlist_once(draft_replies=True)
            _check_jobs[job_id] = {"status": "done", "result": {"new_posts": new_posts}}
        except Exception as e:
            _check_jobs[job_id] = {"status": "error", "result": {"error": str(e)}}

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job_id, "status": "running"}

@app.get("/api/network/watchlist/check/status/{job_id}")
async def check_watchlist_status(job_id: str):
    job = _check_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Serve React frontend (production) ────────────────────────────────────────
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="static")

    @app.get("/")
    async def serve_root():
        return FileResponse(str(DIST / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve React SPA — all non-API routes return index.html."""
        file = DIST / full_path
        if file.exists() and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(DIST / "index.html"))
