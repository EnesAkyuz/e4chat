-- Allow room owners to update their rooms (e.g. toggle is_open)
create policy "Update Rooms" on public.rooms for update
  using ( created_by = auth.uid() );
