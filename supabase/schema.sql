create table if not exists public.transcript_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  video_url text not null,
  title text,
  channel_name text,
  language text default 'en',
  transcript text not null,
  raw_result jsonb,
  created_at timestamptz not null default now()
);

alter table public.transcript_history enable row level security;

drop policy if exists "Users can read their own transcript history" on public.transcript_history;
create policy "Users can read their own transcript history"
  on public.transcript_history
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own transcript history" on public.transcript_history;
create policy "Users can insert their own transcript history"
  on public.transcript_history
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own transcript history" on public.transcript_history;
create policy "Users can delete their own transcript history"
  on public.transcript_history
  for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------
-- User profiles with tiered access (see migration_user_profiles.sql)
-- -----------------------------------------------------------------

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  generations_today int not null default 0,
  last_generation_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);
