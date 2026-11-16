-- Smart AI Advanced schema. Run in the Supabase SQL editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  learning_level text not null default 'Secondary',
  study_goal text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Students manage own profile" on public.profiles;
create policy "Students manage own profile" on public.profiles for all to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.work_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Study lesson',
  kind text not null default 'tutor' check (kind in ('tutor', 'quiz', 'planner', 'flashcards')),
  messages jsonb not null default '[]'::jsonb,
  subject text not null default 'General Studies',
  topic text not null default '',
  score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.work_sessions add column if not exists subject text not null default 'General Studies';
alter table public.work_sessions add column if not exists topic text not null default '';
alter table public.work_sessions add column if not exists score integer;
alter table public.work_sessions add column if not exists created_at timestamptz not null default now();
alter table public.work_sessions drop constraint if exists work_sessions_kind_check;
alter table public.work_sessions add constraint work_sessions_kind_check check (kind in ('tutor','quiz','planner','flashcards'));
alter table public.work_sessions enable row level security;
drop policy if exists "Users can read their own work" on public.work_sessions;
create policy "Users can read their own work" on public.work_sessions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own work" on public.work_sessions;
create policy "Users can create their own work" on public.work_sessions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own work" on public.work_sessions;
create policy "Users can update their own work" on public.work_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own work" on public.work_sessions;
create policy "Users can delete their own work" on public.work_sessions for delete to authenticated using (auth.uid() = user_id);
create index if not exists work_sessions_user_updated_idx on public.work_sessions (user_id, updated_at desc);

-- Progress records are private to each student.
create table if not exists public.topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  topic text not null,
  mastery integer not null default 0 check (mastery between 0 and 100),
  attempts integer not null default 0,
  last_studied_at timestamptz not null default now(),
  unique(user_id, subject, topic)
);
alter table public.topic_progress enable row level security;
drop policy if exists "Students manage own topic progress" on public.topic_progress;
create policy "Students manage own topic progress" on public.topic_progress for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reserved account roles for future teacher/parent features; no cross-student access is granted.
create table if not exists public.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','teacher','parent')),
  created_at timestamptz not null default now()
);
alter table public.account_roles enable row level security;
drop policy if exists "Users can read own role" on public.account_roles;
create policy "Users can read own role" on public.account_roles for select to authenticated using (auth.uid() = user_id);

-- Create a profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name','Student'))
  on conflict (id) do nothing;
  insert into public.account_roles(user_id, role) values (new.id, 'student') on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_smart_ai on auth.users;
create trigger on_auth_user_created_smart_ai after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill profiles and default student roles for accounts created before this migration.
insert into public.profiles(id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name','Student') from auth.users
on conflict (id) do nothing;
insert into public.account_roles(user_id, role)
select id, 'student' from auth.users
on conflict (user_id) do nothing;
