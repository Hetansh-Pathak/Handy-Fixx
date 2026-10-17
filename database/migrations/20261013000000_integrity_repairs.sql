-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix: integrity repairs found in the phase-18 audit (idempotent, safe to re-run).
-- NOT run against a live database here (no Postgres in the sandbox). Apply on STAGING first,
-- after 20261012000000_provider_customer_matching.sql.
--
-- Everything below is ADDITIVE: it never drops a policy you already have. Permissive policies are OR-ed,
-- so adding the correct ones can only make a broken flow work; it cannot lock anyone out.
--
--  1. bookings.status must allow 'on_the_way'. The old migration tried ALTER TYPE booking_status, a type no
--     migration ever creates, so on a clean database "Start trip" violated the CHECK constraint.
--  2. bookings policies: older migrations disagree (user_id vs customer_id vs profiles.id). The apps write
--     customer_id = auth.uid(). Canonical policies + a trigger that keeps user_id and customer_id in step.
--  3. provider_locations: the INSERT/UPDATE policies compared bookings.provider_id (a service_providers.id)
--     with auth.uid() (a user id). They never matched, so live tracking silently stored nothing.
--  4. messages and service_sub_items: used by the apps, created by hand in the dashboard, never in a migration.
--     A clean database had no chat and no price options. Created only if missing.
--  5. Chat: nothing ever raised bookings.unread_messages_*, and customers got no "new message" notice.
--  6. Customer notifications: the app shows booking_confirmed / provider_on_the_way / job_started /
--     job_completed / booking_cancelled, but no trigger ever wrote them (only the admin cancel did).
--  7. "Report an issue" in the provider completion dialog wrote to provider_notifications with
--     provider_id = '__admin__' (not a uuid, no policy): it always failed and still said "Issue reported".
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_type text;
  r record;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'status';

  IF v_type = 'text' OR v_type LIKE 'character%' THEN
    -- Drop every CHECK on bookings that mentions status, then add one that knows every status the apps use.
    FOR r IN
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.bookings'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%status%'
         AND pg_get_constraintdef(oid) NOT ILIKE '%payment_status%'
    LOOP
      EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', r.conname);
    END LOOP;
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('pending', 'confirmed', 'on_the_way', 'in_progress', 'completed', 'cancelled'));
  ELSIF v_type = 'USER-DEFINED' THEN
    -- Enum column: the value is added by the statement below, outside this block.
    NULL;
  END IF;
END $$;

DO $$
DECLARE v_enum text;
BEGIN
  SELECT udt_name INTO v_enum FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'status' AND data_type = 'USER-DEFINED';
  IF v_enum IS NOT NULL THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_enum, 'on_the_way');
  END IF;
END $$;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- Keep user_id and customer_id the same person, whichever one a client sends.
CREATE OR REPLACE FUNCTION public.sync_booking_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.customer_id := COALESCE(NEW.customer_id, NEW.user_id);
  NEW.user_id     := COALESCE(NEW.user_id, NEW.customer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_sync_booking_owner ON public.bookings;
CREATE TRIGGER aa_sync_booking_owner
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_owner();

-- Rows written by the current app have customer_id only; make old policies and the booking_provider_info view see them.
UPDATE public.bookings SET user_id = customer_id WHERE user_id IS NULL AND customer_id IS NOT NULL;

DROP POLICY IF EXISTS "bookings_customer_select" ON public.bookings;
CREATE POLICY "bookings_customer_select" ON public.bookings
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR user_id = auth.uid());

-- The existing RESTRICTIVE "bookings require verified email" policy is still AND-ed on top of this one.
DROP POLICY IF EXISTS "bookings_customer_insert" ON public.bookings;
CREATE POLICY "bookings_customer_insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Column-level limits are enforced by the zz_guard_booking_update trigger (customers: cancel only).
DROP POLICY IF EXISTS "bookings_customer_update" ON public.bookings;
CREATE POLICY "bookings_customer_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "bookings_provider_select" ON public.bookings;
CREATE POLICY "bookings_provider_select" ON public.bookings
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "bookings_provider_update" ON public.bookings;
CREATE POLICY "bookings_provider_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- 3 ─────────────────────────────────────────────────────────────────────────
-- provider_locations.provider_id is the provider's USER id (FK to auth.users); bookings.provider_id is the
-- service_providers row id. The old policies mixed the two up.
DROP POLICY IF EXISTS "Providers can insert own location" ON public.provider_locations;
CREATE POLICY "Providers can insert own location" ON public.provider_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.service_providers sp ON sp.id = b.provider_id
      WHERE b.id = provider_locations.booking_id AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Providers can update own location" ON public.provider_locations;
CREATE POLICY "Providers can update own location" ON public.provider_locations
  FOR UPDATE TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.service_providers sp ON sp.id = b.provider_id
      WHERE b.id = provider_locations.booking_id AND sp.user_id = auth.uid()
    )
  );

-- Customers: the old SELECT policy only matched customer_id; also accept user_id.
DROP POLICY IF EXISTS "Assigned users can view provider location" ON public.provider_locations;
CREATE POLICY "Assigned users can view provider location" ON public.provider_locations
  FOR SELECT TO authenticated
  USING (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = provider_locations.booking_id
        AND (b.customer_id = auth.uid() OR b.user_id = auth.uid())
    )
  );

-- 4 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_sub_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  icon             text,
  base_price       numeric NOT NULL DEFAULT 0,
  duration_minutes integer,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_sub_items_service ON public.service_sub_items(service_id);
ALTER TABLE public.service_sub_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_sub_items_public_read" ON public.service_sub_items;
CREATE POLICY "service_sub_items_public_read" ON public.service_sub_items FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'provider')),
  content     text NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 2000),
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_booking_created ON public.messages(booking_id, created_at);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Participants only: the booking's customer and its provider.
DROP POLICY IF EXISTS "messages_participants_select" ON public.messages;
CREATE POLICY "messages_participants_select" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = messages.booking_id
      AND (b.customer_id = auth.uid() OR b.user_id = auth.uid()
           OR b.provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  ));

DROP POLICY IF EXISTS "messages_participants_insert" ON public.messages;
CREATE POLICY "messages_participants_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = messages.booking_id
        AND (
          (messages.sender_type = 'customer' AND (b.customer_id = auth.uid() OR b.user_id = auth.uid()))
          OR (messages.sender_type = 'provider'
              AND b.provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
        )
    )
  );

-- Read receipts: the OTHER side marks messages read.
DROP POLICY IF EXISTS "messages_recipient_mark_read" ON public.messages;
CREATE POLICY "messages_recipient_mark_read" ON public.messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = messages.booking_id
      AND (b.customer_id = auth.uid() OR b.user_id = auth.uid()
           OR b.provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = messages.booking_id
      AND (b.customer_id = auth.uid() OR b.user_id = auth.uid()
           OR b.provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  ));

-- A participant may only flip is_read, never rewrite what was said.
CREATE OR REPLACE FUNCTION public.messages_only_mark_read()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_type IS DISTINCT FROM OLD.sender_type OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Messages cannot be edited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_messages_only_mark_read ON public.messages;
CREATE TRIGGER trg_messages_only_mark_read
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_only_mark_read();

-- 5 ─────────────────────────────────────────────────────────────────────────
-- Raise the recipient's unread counter, and tell the customer when the pro writes.
CREATE OR REPLACE FUNCTION public.on_message_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
BEGIN
  IF NEW.sender_type = 'customer' THEN
    UPDATE public.bookings SET unread_messages_provider = COALESCE(unread_messages_provider, 0) + 1
     WHERE id = NEW.booking_id;
  ELSE
    UPDATE public.bookings SET unread_messages_customer = COALESCE(unread_messages_customer, 0) + 1
     WHERE id = NEW.booking_id
    RETURNING COALESCE(customer_id, user_id) INTO v_customer;

    -- One unread "new message" notice per booking, not one per message.
    IF v_customer IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.customer_notifications
       WHERE booking_id = NEW.booking_id AND type = 'new_message' AND NOT is_read
    ) THEN
      INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
      VALUES (v_customer, 'new_message', 'New message from your pro',
              'Open the chat to read it.', NEW.booking_id, jsonb_build_object('booking_id', NEW.booking_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_on_message_inserted ON public.messages;
CREATE TRIGGER trg_on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_inserted();

-- 6 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_customer_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid := COALESCE(NEW.customer_id, NEW.user_id);
  v_actor    uuid := auth.uid();
  v_status   text := NEW.status::text;
  v_type     text;
  v_title    text;
  v_msg      text;
BEGIN
  IF v_customer IS NULL OR v_status IS NOT DISTINCT FROM OLD.status::text THEN RETURN NEW; END IF;
  -- Never notify people about their own action. Admin cancellations already write their own notice.
  IF v_actor IS NOT NULL AND (v_actor = v_customer OR public.has_role(v_actor, 'admin')) THEN RETURN NEW; END IF;

  IF    v_status = 'confirmed'   THEN v_type := 'booking_confirmed';   v_title := 'Booking confirmed';   v_msg := 'Your pro accepted the request.';
  ELSIF v_status = 'on_the_way'  THEN v_type := 'provider_on_the_way'; v_title := 'Your pro is on the way'; v_msg := 'Track their arrival from your booking.';
  ELSIF v_status = 'in_progress' THEN v_type := 'job_started';         v_title := 'Work has started';     v_msg := 'Your pro has started the job.';
  ELSIF v_status = 'completed'   THEN v_type := 'job_completed';       v_title := 'Job completed';        v_msg := 'Please pay and rate your pro.';
  ELSIF v_status = 'cancelled'   THEN v_type := 'booking_cancelled';   v_title := 'Booking cancelled';
    v_msg := COALESCE(NULLIF(NEW.cancellation_reason, ''), 'This booking was cancelled.');
  ELSE RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customer_notifications WHERE booking_id = NEW.id AND type = v_type) THEN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (v_customer, v_type, v_title, v_msg, NEW.id, jsonb_build_object('booking_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_customer_on_booking_change ON public.bookings;
CREATE TRIGGER trg_notify_customer_on_booking_change
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_customer_on_booking_change();

-- 7 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_issue_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_issue_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_issue_reports FROM anon, authenticated;
GRANT SELECT ON public.job_issue_reports TO authenticated;
DROP POLICY IF EXISTS "job_issue_reports_admin_select" ON public.job_issue_reports;
CREATE POLICY "job_issue_reports_admin_select" ON public.job_issue_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.report_job_issue(p_booking_id uuid, p_reason text DEFAULT 'customer_unavailable')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;

  SELECT sp.id INTO v_provider
    FROM public.bookings b JOIN public.service_providers sp ON sp.id = b.provider_id
   WHERE b.id = p_booking_id AND sp.user_id = auth.uid();
  IF v_provider IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;

  -- One open report per booking: a second tap is not a second ticket.
  IF NOT EXISTS (SELECT 1 FROM public.job_issue_reports WHERE booking_id = p_booking_id AND status = 'open') THEN
    INSERT INTO public.job_issue_reports (booking_id, provider_id, reason)
    VALUES (p_booking_id, v_provider, LEFT(COALESCE(NULLIF(btrim(p_reason), ''), 'customer_unavailable'), 300));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.report_job_issue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_job_issue(uuid, text) TO authenticated;

-- Realtime: make sure every table the screens subscribe to is published (idempotent, skips missing tables).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings', 'messages', 'customer_notifications', 'provider_notifications', 'service_providers', 'provider_locations']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Verify after applying (should return the values in the comments):
--   select conname from pg_constraint where conrelid='public.bookings'::regclass and conname='bookings_status_check';  -- 1 row (text column only)
--   select policyname from pg_policies where tablename='provider_locations';  -- insert/update/select policies above
--   select count(*) from public.messages;  -- table exists

-- PostgREST caches the schema: without this a freshly created function/table can answer "not found in the schema cache".
NOTIFY pgrst, 'reload schema';
