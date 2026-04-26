-- Auth migration: adds user_id + RLS to companies and jobs
-- Run this in Supabase SQL Editor AFTER schema.sql

-- ── Add user_id columns ───────────────────────────────────────────────────────
alter table companies add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table jobs      add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- ── Enable RLS ────────────────────────────────────────────────────────────────
alter table companies enable row level security;
alter table jobs      enable row level security;

-- ── Companies policies ────────────────────────────────────────────────────────
create policy "companies: select own" on companies for select using (auth.uid() = user_id);
create policy "companies: insert own" on companies for insert with check (auth.uid() = user_id);
create policy "companies: update own" on companies for update using (auth.uid() = user_id);
create policy "companies: delete own" on companies for delete using (auth.uid() = user_id);

-- ── Jobs policies ─────────────────────────────────────────────────────────────
create policy "jobs: select own" on jobs for select using (auth.uid() = user_id);
create policy "jobs: insert own" on jobs for insert with check (auth.uid() = user_id);
create policy "jobs: update own" on jobs for update using (auth.uid() = user_id);
create policy "jobs: delete own" on jobs for delete using (auth.uid() = user_id);

-- ── User profiles ─────────────────────────────────────────────────────────────
create table if not exists user_profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  full_name       text,
  anthropic_key   text,
  apify_token     text,
  profile_md      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table user_profiles enable row level security;
create policy "profiles: select own" on user_profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on user_profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on user_profiles for update using (auth.uid() = id);

-- ── Auto-create profile on signup ─────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
