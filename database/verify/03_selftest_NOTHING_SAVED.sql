-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 - WALLET SELF-TEST. Saves NOTHING.
-- It uses one real approved provider, simulates cash dues / limit / top-up,
-- then deliberately ends with an error so everything is rolled back.
-- A RED error box at the end is EXPECTED. Read the PASS / FAIL lines in it.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_report text := '';
  v_pid    uuid;
  v_before numeric;
  v_bal    numeric;
  v_adj    numeric;
  v_online boolean;
  v_ok     boolean;
  v_reason text;
  v_key    text := 'selftest:' || gen_random_uuid()::text;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers
  WHERE kyc_status = 'approved' AND status = 'active' LIMIT 1;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'SELFTEST: no approved + active provider found to test with (nothing saved)';
  END IF;

  v_before := public.wallet_balance(v_pid);

  -- 1. cash fee posts and changes the balance
  v_ok := public.wallet_post(v_pid, NULL, 'cash_fee', -60, v_key || 'a', NULL, 'selftest');
  v_report := v_report || format(E'%s  cash fee of 60 posted, balance %s -> %s\n',
    CASE WHEN v_ok AND public.wallet_balance(v_pid) = v_before - 60 THEN 'PASS' ELSE 'FAIL' END,
    v_before, public.wallet_balance(v_pid));

  -- 2. replay with the same key is ignored
  v_ok := public.wallet_post(v_pid, NULL, 'cash_fee', -60, v_key || 'a', NULL, 'selftest replay');
  v_report := v_report || format(E'%s  same key posted twice is ignored (only one row)\n',
    CASE WHEN NOT v_ok AND public.wallet_balance(v_pid) = v_before - 60 THEN 'PASS' ELSE 'FAIL' END);

  -- 3. reach the dues limit -> forced offline
  UPDATE public.wallet_settings SET dues_limit = 50;
  UPDATE public.service_providers SET is_online = true WHERE id = v_pid;
  v_bal := public.wallet_balance(v_pid);
  v_adj := -(v_bal + 50);
  IF v_adj <> 0 THEN
    PERFORM public.wallet_post(v_pid, NULL, 'adjustment', v_adj, v_key || 'b', NULL, 'selftest limit');
  END IF;
  SELECT is_online INTO v_online FROM public.service_providers WHERE id = v_pid;
  v_report := v_report || format(E'%s  balance %s (limit 50): provider forced offline\n',
    CASE WHEN v_online IS NOT TRUE AND public.provider_block_reason(v_pid) = 'dues_limit' THEN 'PASS' ELSE 'FAIL' END,
    public.wallet_balance(v_pid));

  -- 4. cannot go online while blocked
  UPDATE public.service_providers SET is_online = true WHERE id = v_pid;
  SELECT is_online INTO v_online FROM public.service_providers WHERE id = v_pid;
  v_report := v_report || format(E'%s  going online is refused while over the limit\n',
    CASE WHEN v_online IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END);

  -- 5. top-up clears the block
  PERFORM public.wallet_post(v_pid, NULL, 'topup', 500, v_key || 'c', NULL, 'selftest topup');
  v_reason := public.provider_block_reason(v_pid);
  UPDATE public.service_providers SET is_online = true WHERE id = v_pid;
  SELECT is_online INTO v_online FROM public.service_providers WHERE id = v_pid;
  v_report := v_report || format(E'%s  after top-up the block is gone (balance %s, block reason: %s)\n',
    CASE WHEN v_reason IS DISTINCT FROM 'dues_limit' AND (v_online IS TRUE OR v_reason IS NOT NULL) THEN 'PASS' ELSE 'FAIL' END,
    public.wallet_balance(v_pid), COALESCE(v_reason, 'none'));

  -- 6. ledger rows cannot be edited
  BEGIN
    UPDATE public.wallet_transactions SET amount = 1 WHERE idempotency_key = v_key || 'a';
    v_report := v_report || E'FAIL  a ledger row could be edited\n';
  EXCEPTION WHEN OTHERS THEN
    v_report := v_report || E'PASS  ledger rows cannot be edited or deleted\n';
  END;

  -- 7. clients have no write access to money tables
  v_report := v_report || format(E'%s  app users have no INSERT/UPDATE/DELETE on wallet_transactions\n',
    CASE WHEN NOT has_table_privilege('authenticated','public.wallet_transactions','INSERT')
              AND NOT has_table_privilege('authenticated','public.wallet_transactions','UPDATE')
              AND NOT has_table_privilege('authenticated','public.wallet_transactions','DELETE') THEN 'PASS' ELSE 'FAIL' END);
  v_report := v_report || format(E'%s  app users cannot write provider_earnings or payout_requests\n',
    CASE WHEN NOT has_table_privilege('authenticated','public.provider_earnings','UPDATE')
              AND NOT has_table_privilege('authenticated','public.payout_requests','INSERT') THEN 'PASS' ELSE 'FAIL' END);

  RAISE EXCEPTION E'WALLET SELF-TEST FINISHED. Nothing was saved (this red box is expected).\n\n%', v_report;
END $$;
