-- Fix RLS Recursion in View Rooms policy
-- The previous policy used 'has_room_access(id)' which internally selected from 'rooms', causing infinite recursion.

drop policy if exists "View Rooms" on public.rooms;

create policy "View Rooms" on public.rooms for select
  using ( 
    created_by = auth.uid() 
    or (
      is_open = true 
      and exists (
        select 1 from public.room_participants 
        where room_id = id 
        and profile_id = auth.uid()
      )
    )
  );
