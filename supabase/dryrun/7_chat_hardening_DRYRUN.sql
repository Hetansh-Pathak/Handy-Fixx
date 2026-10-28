-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal (HandyFix-complete.pdf p.4 and p.12): chat opens once a pro accepts, and phone numbers typed in chat
-- are blocked so the two sides do not move off the app.
--
-- Found on the live project (2026-10-28, read-only)
--   * Policy "messages_insert" only checks sender_id = auth.uid(). Policies are OR-ed, so ANY signed-in user can
--     post a message into ANY booking's chat, as customer or as provider (spam, impersonation).
--   * Nothing checks the booking's status, so chat stays open forever, including on cancelled bookings.
--   * Nothing stops a phone number. The app blocks them, but a modified app could still send one.
--
-- What this does
--   1. Drops the loose "messages_insert" policy. The stricter "messages_participants_insert" stays: only the
--      booking's own customer, or the booking's own pro, can post, with the matching sender_type.
--   2. Adds a BEFORE INSERT trigger: chat is open only while the booking is confirmed, on_the_way, arrived or in_progress;
--      the text must be 1 to 1000 characters; and a phone number is refused. A phone number here means a 10-digit
--      run starting 6-9 (or 0 + 9-10 digits for a landline) after removing the spaces, dashes and dots people put
--      between digits. Digits in Hindi or Gujarati script count too. Spelled-out digits are checked by the app only.
--
-- It does not change existing messages. Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "messages_insert" ON public.messages;

-- The rule itself, with no table access, so it can be tested with plain text. Returns the reason, or NULL when fine.
CREATE OR REPLACE FUNCTION public.chat_message_problem(p_status text, p_content text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('confirmed', 'on_the_way', 'arrived', 'in_progress') THEN
    RETURN 'This chat is closed.';
  END IF;
  IF p_content IS NULL OR length(btrim(p_content)) = 0 OR length(p_content) > 1000 THEN
    RETURN 'A message must be 1 to 1000 characters.';
  END IF;
  -- Devanagari and Gujarati digits to 0-9, then drop separators between digits ("98 76-54.3210" -> "9876543210").
  v_clean := translate(lower(p_content), '०१२३४५६७८९૦૧૨૩૪૫૬૭૮૯', '01234567890123456789');
  v_clean := regexp_replace(v_clean, '(\d)[\s\-.,()/_+*#]+(?=\d)', '\1', 'g');
  IF v_clean ~ '[6-9]\d{9}' OR v_clean ~ '0\d{9,10}' THEN
    RETURN 'For your safety, phone numbers cannot be shared in chat. You can call each other from the Call button once the booking is confirmed.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_problem text;
BEGIN
  v_problem := public.chat_message_problem((SELECT status::text FROM public.bookings WHERE id = NEW.booking_id), NEW.content);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_chat_message ON public.messages;
CREATE TRIGGER a_guard_chat_message
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_message();

-- ─── ROLLBACK ───
-- DROP TRIGGER IF EXISTS a_guard_chat_message ON public.messages;
-- DROP FUNCTION IF EXISTS public.guard_chat_message();
-- DROP FUNCTION IF EXISTS public.chat_message_problem(text, text);
-- CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

-- ─── SELF-TEST (plain text, no data touched) ───
SELECT t AS text, public.chat_message_problem('in_progress', t) IS NOT NULL AS blocked
FROM unnest(ARRAY[
  'On my way, 10 minutes', 'Rs 2500 only', 'see you 2026-11-05 10:30', 'pincode 380015', 'the code is 4821',
  '9876543210', '+91 98765 43210', '98-76-54-32-10', '९८७६५४३२१०', '૯૮૭૬૫૪૩૨૧૦', '079 2345 6789']) AS t;
SELECT s AS status, public.chat_message_problem(s, 'hello') AS problem
FROM unnest(ARRAY['pending','confirmed','on_the_way','arrived','in_progress','completed','cancelled']) AS s;

ROLLBACK;
