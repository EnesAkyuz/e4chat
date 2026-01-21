-- Function to refill tokens dynamically with more generous limits
CREATE OR REPLACE FUNCTION public.refill_ai_tokens(room_id_input UUID)
RETURNS VOID AS $$
DECLARE
    participant_count INTEGER;
    model_count INTEGER;
    new_max INTEGER;
    current_tokens INTEGER;
BEGIN
    -- Count human participants (distinct profiles)
    SELECT COUNT(DISTINCT profile_id) INTO participant_count
    FROM public.room_participants
    WHERE room_id = room_id_input;

    -- Count AI models
    SELECT COUNT(*) INTO model_count
    FROM public.room_models
    WHERE room_id = room_id_input;

    -- Formula: max(10, humans * 5 - models)
    -- Much more generous to allow for multi-turn debates
    new_max := GREATEST(10, (participant_count * 5) - model_count);

    -- Update room: set new max and refill
    -- We'll add 2 tokens per message now instead of 1, up to max
    UPDATE public.rooms
    SET 
        ai_tokens_max = new_max,
        ai_tokens = LEAST(new_max, ai_tokens + 2)
    WHERE id = room_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
