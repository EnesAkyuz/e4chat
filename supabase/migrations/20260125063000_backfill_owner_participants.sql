-- Backfill: Add room creators as participants
-- This ensures owners show up in the member list for existing rooms

INSERT INTO public.room_participants (room_id, profile_id, role)
SELECT r.id, r.created_by, 'owner'
FROM public.rooms r
WHERE NOT EXISTS (
  SELECT 1 FROM public.room_participants rp 
  WHERE rp.room_id = r.id AND rp.profile_id = r.created_by
);
