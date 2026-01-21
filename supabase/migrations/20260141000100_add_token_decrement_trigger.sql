-- Function to decrement AI tokens
CREATE OR REPLACE FUNCTION public.decrement_ai_token(room_id_input UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.rooms
    SET ai_tokens = GREATEST(0, ai_tokens - 1)
    WHERE id = room_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to refill tokens on human message
CREATE OR REPLACE FUNCTION public.handle_human_message_refill()
RETURNS TRIGGER AS $$
BEGIN
    -- Only for human messages (is_ai = false)
    IF NEW.is_ai = false THEN
        -- Call the existing refill function (or the one we created in previous migration)
        -- This function recalculates max and adds 1 token
        PERFORM public.refill_ai_tokens(NEW.room_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger
DROP TRIGGER IF EXISTS on_human_message_refill ON public.messages;
CREATE TRIGGER on_human_message_refill
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_human_message_refill();
