import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OFFER_STATUSES } from "./offer";
import { DISPATCH_STATES } from "./search";
import { DEFAULT_DISPATCH_SETTINGS as S } from "./settings";

// The database twin of these rules (proposal 20261124000000) must say the same thing. The behaviour itself is tested
// on a real throwaway Postgres: supabase/tests/instant-dispatch (59 checks, including truly concurrent accepts).
const sql = readFileSync(resolve(__dirname, "../../../../supabase/proposals/20261124000000_instant_dispatch_PROPOSAL_NOT_APPLIED.sql"), "utf8");
const area = readFileSync(resolve(__dirname, "../../../../supabase/proposals/20261124000001_dispatch_service_area_PROPOSAL_NOT_APPLIED.sql"), "utf8");

describe("dispatch SQL matches the shared rules", () => {
  it("same default settings", () => {
    expect(sql).toContain(`ring_radii_km          numeric[] NOT NULL DEFAULT '{${S.rings.map((r) => r.radiusKm).join(",")}}'`);
    expect(sql).toContain(`ring_wait_seconds      integer[] NOT NULL DEFAULT '{${S.rings.map((r) => r.waitSeconds).join(",")}}'`);
    expect(sql).toContain(`city_name              text NOT NULL DEFAULT '${S.city.name}'`);
    expect(sql).toContain(`city_lat               double precision NOT NULL DEFAULT ${S.city.centre.latitude}`);
    expect(sql).toContain(`city_lng               double precision NOT NULL DEFAULT ${S.city.centre.longitude}`);
    expect(sql).toContain(`city_radius_km         numeric NOT NULL DEFAULT ${S.city.radiusKm}`);
    expect(sql).toContain(`max_search_seconds     integer NOT NULL DEFAULT ${S.maxSearchSeconds}`);
    expect(sql).toContain(`extend_seconds         integer NOT NULL DEFAULT ${S.extendSeconds}`);
    expect(sql).toContain(`presence_fresh_seconds integer NOT NULL DEFAULT ${S.presenceFreshSeconds}`);
  });
  it("same offer and search states", () => {
    expect(sql).toContain(`CHECK (status IN (${OFFER_STATUSES.map((s) => `'${s}'`).join(",")}))`);
    expect(sql).toContain(`CHECK (dispatch_state IS NULL OR dispatch_state IN (${DISPATCH_STATES.map((s) => `'${s}'`).join(",")}))`);
  });
  it("same ring rules: empty rings skipped, nobody at all = no pro, the city ring has no deadline", () => {
    expect(sql).toContain("EXIT WHEN v_new > 0 OR v_next >= v_last;");
    expect(sql).toContain("IF v_next >= v_last AND v_new = 0 AND v_open = 0 THEN");
    expect(sql).toContain("v_wait := CASE WHEN v_next < v_last THEN s.ring_wait_seconds[v_next] END;");
  });
  it("same eligibility: approved, active, online, fresh, offers the service; distance only, no wallet filter", () => {
    for (const line of [
      "WHERE sp.kyc_status = 'approved'",
      "AND sp.status::text = 'active'",
      "AND sp.is_online IS TRUE",
      "AND pp.updated_at > now() - make_interval(secs => s.presence_fresh_seconds)",
      "AND b.service_id = ANY (COALESCE(sp.service_ids, ARRAY[]::uuid[]))",
      "ORDER BY c.km, c.rating DESC NULLS LAST, c.id;",
    ]) expect(sql).toContain(line);
    expect(sql).not.toMatch(/pincodes/);
    expect(sql).not.toMatch(/wallet_balance\([^)]*\)\s*[<>]/);
  });
  it("same offer moves: only open offers change; keep looking re-opens expired ones only", () => {
    expect(sql).toContain("UPDATE public.booking_offers SET status = 'taken', responded_at = now() WHERE booking_id = b.id AND id <> o.id AND status = 'offered';");
    expect(sql).toContain("UPDATE public.booking_offers SET status = 'offered', responded_at = NULL, offered_at = now() WHERE booking_id = b.id AND status = 'expired';");
    expect(sql).toContain("IF b.dispatch_state IS DISTINCT FROM 'no_pro' OR b.provider_id IS NOT NULL OR b.status::text <> 'pending' THEN");
  });
  it("service area (20261124000001): same prefix and the same test as servesCity, city ring only, fresh heartbeat needed", () => {
    expect(area).toContain(`city_pincode_prefix text NOT NULL DEFAULT '${S.city.pincodePrefix}'`);
    expect(area).toContain("WHERE lower(btrim(a)) = lower(btrim(s.city_name))");
    expect(area).toContain("OR (btrim(a) ~ '^[0-9]{6}$' AND btrim(a) LIKE s.city_pincode_prefix || '%')");
    expect(area).toContain("WHEN c.serves_city AND c.heartbeat_fresh THEN c.km_to_centre");
    expect(area).toContain("CASE WHEN c.gps_in_city OR (c.serves_city AND c.heartbeat_fresh) THEN (SELECT (cardinality(ring_radii_km) + 1)::smallint FROM s) END) AS ring");
  });
  it("first accept wins under a row lock", () => {
    expect(sql).toContain("SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;");
    expect(sql).toContain("SET provider_id = v_pid, status = 'confirmed', dispatch_state = 'assigned'");
  });
});
