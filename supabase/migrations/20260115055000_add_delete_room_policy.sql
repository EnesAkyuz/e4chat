-- Allow room owners to delete their rooms
create policy "Delete Rooms" on public.rooms for delete
  using ( created_by = auth.uid() );

-- Allow users to delete their own messages OR room owners to moderate
create policy "Delete Messages" on public.messages for delete
  using ( 
    profile_id = auth.uid() 
    or exists (
      select 1 from public.rooms where id = room_id and created_by = auth.uid()
    )
  );

-- Allow room owners to remove participants OR users to leave
create policy "Delete Participants" on public.room_participants for delete
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.rooms where id = room_id and created_by = auth.uid()
    )
  );
