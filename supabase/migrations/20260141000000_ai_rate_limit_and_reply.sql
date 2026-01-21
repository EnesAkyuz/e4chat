-- Add AI token bucket to rooms
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS ai_tokens INTEGER DEFAULT 5;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS ai_tokens_max INTEGER DEFAULT 5;

-- Add reply-to functionality to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id);

-- Function to refill tokens dynamically
CREATE OR REPLACE FUNCTION public.refill_ai_tokens(room_id_input UUID)
RETURNS VOID AS $$
DECLARE
    participant_count INTEGER;
    model_count INTEGER;
    new_max INTEGER;
BEGIN
    -- Count human participants (distinct profiles)
    SELECT COUNT(DISTINCT profile_id) INTO participant_count
    FROM public.room_participants
    WHERE room_id = room_id_input;

    -- Count AI models
    SELECT COUNT(*) INTO model_count
    FROM public.room_models
    WHERE room_id = room_id_input;

    -- Formula: max(3, humans * 2 - models)
    new_max := GREATEST(3, (participant_count * 2) - model_count);

    -- Update room: set new max and increment current tokens (capped at new max)
    UPDATE public.rooms
    SET 
        ai_tokens_max = new_max,
        ai_tokens = LEAST(new_max, ai_tokens + 1)
    WHERE id = room_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
