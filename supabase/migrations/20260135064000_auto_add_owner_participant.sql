-- Trigger: Automatically add room creator as participant when a room is created
-- This ensures owners always show up in the member list

CREATE OR REPLACE FUNCTION public.add_owner_as_participant()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.room_participants (room_id, profile_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (room_id, profile_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to avoid errors on re-run
DROP TRIGGER IF EXISTS on_room_created ON public.rooms;

CREATE TRIGGER on_room_created
  AFTER INSERT ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.add_owner_as_participant();
