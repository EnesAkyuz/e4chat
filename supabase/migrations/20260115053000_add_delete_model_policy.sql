-- Allow users to delete room models
-- Currently, we only check if they have access to the room.
-- This allows any member to remove a model, which facilitates the 'kick out' feature.
create policy "Delete Room Models" on public.room_models for delete using ( public.has_room_access(room_id) );
