# Talent Density

The best opportunities don't come from job boards. They come from people who already trust you. Talent Density is an intelligence layer for finding, tracking, and genuinely engaging the people who matter — before you need anything from them.

The core loop: map where exceptional people concentrate → identify the right peer-contact → catch the moment they post → reply as a builder, not a job seeker → stay in the loop continuously.

Originally a CLI + Streamlit project. Now a full multi-user web app (React + FastAPI + Supabase) with auth, ready for public launch.

---

## What's inside

### Web app (React + FastAPI)

8 tabs, all gated behind Supabase Auth:

| Tab | What it does |
|---|---|
| **Open Roles** | Roles scored 75+ at high-talent-density companies. ATS analysis, prep materials, status tracking |
| **On Radar** | Companies worth watching that don't have an open role yet. Agent drafts a warm outreach in your voice |
| **Pipeline** | Active conversations → `prep_ready` → `applied` → `interviewing` → `offer` |
| **Outreach** | Everyone you've reached out to (people + companies). Follow-up nudges |
| **Applied** | Closed-loop application tracking |
| **Roadmap** | Enter a company → predicts its 12-24M product roadmap from every JD they've posted. Useful for outreach hooks and prep |
| **Network** | Find your peer-contact at any company (6-factor scoring). Watch them on X — get alerted within 20 min of a post, with a pre-drafted reply |
| **Sources** | Add companies, scan TechCrunch + Next Play funding news, paste LinkedIn posts to extract company names |

### Intelligence engine

| Module | What it does |
|---|---|
| **Discover** | Polls Ashby, Greenhouse, Lever, Workable boards + LinkedIn + web search for open roles |
| **RSS scan** | TechCrunch + Next Play newsletter for fresh-funded AI companies |
| **Score** | Two-stage: keyword pre-filter (free) → Claude Sonnet on 5 dimensions. Prompt-cached for cost |
| **Network intelligence** | Finds your peer-contact at any company — 6-factor score for who'll respond (not the CEO) |
| **Twitter monitor** | Watchlist → Apify poll every 20 min → alert + pre-drafted reply within one polling cycle |
| **Roadmap predictor** | Reads every JD a company has posted → structured 12-24M product thesis + team scaling pattern |
| **ATS** | Resume vs JD gap analysis — missing keywords, rewrite suggestions, cover letter angles |
| **Prep** | Auto-generated outreach for prep-ready roles, in your voice |
| **Chat CLI** | Conversational control over everything (`python3 cli.py`) |

---

## Architecture

```
job-agent/
├── frontend/                    # React + Vite (multi-user web app)
│   └── src/
│       ├── pages/               # Open Roles, On Radar, Pipeline, Outreach, Applied, Roadmap, Sources, Auth
│       ├── components/          # AuthGuard, JobCard, ScoreBadge, FilterLink, Toast...
│       └── lib/supabase.js      # Supabase client (auth + reads via RLS)
├── api/
│   └── main.py                  # FastAPI: ATS, pipeline run, radar drafts, roadmap predict, sources/extract, sources/funding-scan
├── agent/
│   ├── client.py                # Shared Anthropic client (handles OAuth + API key)
│   ├── discover.py              # Ashby / Greenhouse / Lever / Workable / web search scraping
│   ├── discover_from_rss.py     # TechCrunch + Next Play RSS funding scan
│   ├── discover_from_post.py    # Extract company names from LinkedIn post
│   ├── score.py                 # Claude two-stage scoring
│   ├── pipeline.py              # End-to-end company → role → score
│   ├── ats.py                   # Resume vs JD ATS analysis
│   ├── network.py               # 6-factor "hidden gem" contact finder
│   ├── reach_out.py             # Per-person outreach drafting
│   ├── twitter_monitor.py       # Apify + macOS notification + reply drafts
│   ├── monitor_linkedin.py
│   └── prep.py                  # Interview prep
├── cli.py                       # Claude-powered chat CLI
├── dashboard.py                 # Legacy Streamlit dashboard
├── scheduler.py                 # APScheduler — discovery, scoring, twitter
├── schema.sql                   # Base Supabase schema
├── schema_auth.sql              # Auth: user_id columns + RLS policies + user_profiles + signup trigger
├── schema_rls_fix.sql           # Re-apply RLS policies if drifted
├── Procfile / railway.json      # Railway deployment
└── profile/harry.md             # Profile that drives personalised outreach
```

---

## Setup

### 1. Clone & install

```bash
git clone git@github.com:harrykapoor19/talent-density.git
cd talent-density
pip3 install -r requirements.txt
cd frontend && npm install && cd ..
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# Anthropic — console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-...
# Optional: dedicated key so you don't share quota with Claude Code OAuth
ANTHROPIC_PROJECT_KEY=sk-ant-api03-...

# Supabase — project settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Apify — console.apify.com/settings/integrations
APIFY_API_TOKEN=apify_api_...
```

Frontend env (`frontend/.env.local`) — same Supabase project as API:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database

Run both schema files against your Supabase project (SQL Editor):

```sql
-- 1. base tables
\i schema.sql

-- 2. multi-user auth (user_id, RLS policies, user_profiles, signup trigger)
\i schema_auth.sql
```

### 4. Profile

Edit `profile/harry.md` — work history, target companies, writing samples, tone. This drives outreach drafts, reply generation, and ATS analysis.

---

## Run it

### Web app (recommended)

Two processes:

```bash
# Terminal 1 — API
uvicorn api.main:app --reload --port 8001

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open `http://localhost:3001` (or whatever Vite picks). Sign up with email — Supabase Auth + RLS isolates each user's data completely.

### Chat CLI

```bash
python3 cli.py
```

Examples:

```
> add Cursor, Linear, Notion to my target list
> who should I reach out to at Anthropic?
> predict the roadmap for Cartesia
> add @danluu to my twitter watchlist
> what's my pipeline looking like?
> brief me on Cursor
```

Tools: `add_target_company`, `list_pipeline`, `brief_company`, `find_people`, `research_person`, `add_to_watchlist`, `check_watchlist`, `generate_outreach`.

### Background scheduler

```bash
python3 scheduler.py
```

| Job | Cadence |
|---|---|
| Discovery (Ashby + Greenhouse + Lever + Workable) | Every 6 hours |
| Job scoring | Every 30 min |
| Twitter monitor | Every 20 min, Mon–Sat 6am–10pm PT |

macOS users: double-click `Start Scheduler.command` to run it as a background process.

---

## Key features in depth

### The 10-minute reply window

Replies in the first 10 minutes of a tweet get ~3× more engagement. The monitor:

1. Polls your watchlist via Apify every 20 min
2. Fires an alert the moment someone posts
3. Generates a context-aware peer reply — specific, not flattery
4. You review, you reply. Nothing goes automatically.

### Peer-contact finder (6-factor scoring)

The insight: NOT the CEO. The "hidden gem" — relevant team, low inbox load, growth mindset.

| Factor | Weight | Signal |
|---|---|---|
| Role Relevance | 25% | Can they actually champion you internally? |
| Low Inbox Load | 25% | Inverted fame metric — <5K followers scores highest |
| Growth Mindset | 20% | Posts, engages strangers, shares learnings |
| Company Tenure | 15% | Recent joiners (<12 months) are most network-hungry |
| Profile Match | 10% | Shared background / sector overlap |
| Network Distance | 5% | 2nd degree > cold |

### Roadmap predictor

Reads every JD a company has posted → returns structured prediction:

- **Thesis** — 2-3 sentence product direction with JD evidence
- **Product bets** — 3-5 bets with confidence levels
- **Team scaling** — function-by-function hiring pattern
- **Tech signals** — stack, infra, architectural shifts
- **Telling absences** — what they're NOT hiring for
- **Next milestone** — concrete prediction

Useful for outreach hooks ("I noticed you're building X…") and prep calls.

### Multi-user auth

`schema_auth.sql` adds `user_id uuid` to `companies` + `jobs`, enables RLS, and creates 8 policies (`select/insert/update/delete × companies/jobs`) gating on `auth.uid() = user_id`. Signup trigger auto-creates a `user_profiles` row holding per-user `anthropic_key`, `apify_token`, `profile_md`.

The frontend uses `supabase-js` with the anon key. Every read is auto-scoped by RLS. The FastAPI backend can validate JWTs via `require_user()` and create a JWT-scoped Supabase client via `get_user_supabase()` so server-side reads also respect RLS.

---

## Deployment

### Railway (API + scheduler)

```bash
railway login
railway init
railway up
```

Set the same env vars as `.env` in the Railway dashboard.

### Vercel (frontend)

```bash
cd frontend
vercel --prod
```

Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in Vercel project env.

---

## Tech stack

- **AI:** Claude (Anthropic) — `claude-sonnet-4-6` for scoring/drafting, `claude-haiku-4-5-20251001` for ATS + roadmap. Prompt caching on resume + system prompts.
- **Frontend:** React 18 + Vite + Tailwind + react-router-dom + lucide-react
- **Backend:** FastAPI + APScheduler
- **Database + Auth:** Supabase (PostgreSQL + GoTrue) with RLS
- **Scraping:** Apify (`apidojo/tweet-scraper`), Ashby/Greenhouse/Lever/Workable public APIs
- **Legacy dashboard:** Streamlit (`dashboard.py`)
- **Deployment:** Railway (API + scheduler) + Vercel (frontend)

---

## API endpoints (reference)

| Endpoint | Purpose |
|---|---|
| `POST /api/ats` | Resume vs JD analysis |
| `POST /api/pipeline/run` | Trigger one full discovery + scoring pass |
| `POST /api/pipeline/run-for-companies` | Run pipeline for a specific list (background job) |
| `GET /api/pipeline/status/{job_id}` | Poll background pipeline run |
| `POST /api/pipeline/generate-prep` | Draft outreach for a pipeline job |
| `POST /api/radar/generate-draft` | Draft LinkedIn-style outreach for a Radar company |
| `POST /api/sources/add` | Add company names or job URLs in bulk |
| `POST /api/sources/extract-post` | Extract companies from a LinkedIn post |
| `POST /api/sources/funding-scan` | Scan TechCrunch + Next Play RSS (background) |
| `GET /api/sources/funding-scan/status/{job_id}` | Poll funding scan |
| `POST /api/roadmap/predict` | Predict 12-24M roadmap of a company from its JDs |
| `GET /api/health` | Liveness probe |
