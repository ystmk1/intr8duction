alter table public.participants
add column if not exists photo_paths text[] not null default '{}'::text[];

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'participant-photos',
  'participant-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "participant photos can upload" on storage.objects;
create policy "participant photos can upload"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'participant-photos');

drop policy if exists "participant photos can remove after failed submit" on storage.objects;
create policy "participant photos can remove after failed submit"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'participant-photos');
