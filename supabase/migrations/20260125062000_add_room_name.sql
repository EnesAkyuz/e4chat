-- Add name column to rooms for better display
alter table public.rooms add column if not exists name text;

-- Backfill existing rooms: use slug as name if name is null
update public.rooms set name = slug where name is null;
