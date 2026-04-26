-- Run this in Supabase SQL Editor to enable RLS
alter table companies enable row level security;
alter table jobs enable row level security;

drop policy if exists "companies: select own" on companies;
drop policy if exists "companies: insert own" on companies;
drop policy if exists "companies: update own" on companies;
drop policy if exists "companies: delete own" on companies;

drop policy if exists "jobs: select own" on jobs;
drop policy if exists "jobs: insert own" on jobs;
drop policy if exists "jobs: update own" on jobs;
drop policy if exists "jobs: delete own" on jobs;

create policy "companies: select own" on companies for select using (auth.uid() = user_id);
create policy "companies: insert own" on companies for insert with check (auth.uid() = user_id);
create policy "companies: update own" on companies for update using (auth.uid() = user_id);
create policy "companies: delete own" on companies for delete using (auth.uid() = user_id);

create policy "jobs: select own" on jobs for select using (auth.uid() = user_id);
create policy "jobs: insert own" on jobs for insert with check (auth.uid() = user_id);
create policy "jobs: update own" on jobs for update using (auth.uid() = user_id);
create policy "jobs: delete own" on jobs for delete using (auth.uid() = user_id);
