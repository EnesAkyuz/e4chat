-- Enable Full Replication for tables where we use filtered DELETE subscriptions
-- This ensures the 'OLD' payload sent to Realtime includes all columns, 
-- allowing 'room_id' filters to work on DELETE events.
alter table public.rooms replica identity full;
alter table public.room_models replica identity full;
alter table public.room_participants replica identity full;
alter table public.messages replica identity full;
