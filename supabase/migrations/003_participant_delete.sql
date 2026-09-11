drop policy if exists "screen can delete participants" on public.participants;
create policy "screen can delete participants"
on public.participants for delete
to anon, authenticated
using (true);

grant delete on public.participants to anon, authenticated;
