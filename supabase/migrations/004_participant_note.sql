-- A couple of free lines under the name on the monitor: anything the
-- participant wants to add that the other fields do not cover.
alter table public.participants
add column if not exists note text check (note is null or char_length(note) <= 80);
