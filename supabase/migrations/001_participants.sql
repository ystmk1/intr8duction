create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 24),
  student_id text not null check (student_id ~ '^[0-9]{2}$'),
  major text not null check (char_length(btrim(major)) between 1 and 60),
  sub_major text check (sub_major is null or char_length(sub_major) <= 60),
  work_interest text check (work_interest is null or char_length(work_interest) <= 180),
  personal_interest text check (personal_interest is null or char_length(personal_interest) <= 180),
  message text check (message is null or char_length(message) <= 240),
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.participants enable row level security;

drop policy if exists "participants can submit" on public.participants;
create policy "participants can submit"
on public.participants for insert
to anon, authenticated
with check (visible = true);

drop policy if exists "screen can read visible participants" on public.participants;
create policy "screen can read visible participants"
on public.participants for select
to anon, authenticated
using (visible = true);

grant select, insert on public.participants to anon, authenticated;
