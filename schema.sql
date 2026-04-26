-- Job Agent Schema
-- Run against your Supabase project to initialise the database.

-- ── Companies ────────────────────────────────────────────────────────────────
create table if not exists companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  what_they_do        text,
  sector              text,
  stage               text,
  funding_info        text,
  attention_score     integer,
  ashby_slug          text,
  greenhouse_slug     text,
  lever_slug          text,
  workable_slug       text,
  relationship_message text,
  source              text default 'manual',
  skip                boolean default false,
  feedback            text,
  feedback_reason     text,
  radar_status        text,
  created_at          timestamptz default now()
);

-- ── Jobs ─────────────────────────────────────────────────────────────────────
create table if not exists jobs (
  id                  uuid primary key default gen_random_uuid(),
  company_name        text not null,
  company_id          uuid references companies(id) on delete set null,
  title               text not null,
  url                 text,
  jd_text             text,
  source              text,
  status              text default 'new',
  attractiveness_score integer,
  score_breakdown     jsonb,
  score_reasoning     text,
  seniority_pass      boolean,
  no_list_pass        boolean,
  prep_materials      jsonb,
  created_at          timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_companies_name        on companies(name);
create index if not exists idx_companies_attention   on companies(attention_score desc);
create index if not exists idx_jobs_company_name     on jobs(company_name);
create index if not exists idx_jobs_status           on jobs(status);
create index if not exists idx_jobs_attractiveness   on jobs(attractiveness_score desc);
create index if not exists idx_jobs_created          on jobs(created_at desc);
