import { asString, corsHeaders, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { rateKey } from "../_shared/otp.ts";
import { decryptPan, loadKeyring, type Keyring, type SealedPan } from "../_shared/pan-crypto.ts";

// PROPOSAL 20261125000001 (finding H3), NOT DEPLOYED. The only way to see a full PAN: admins only, every view is
// written to kyc_access_log BEFORE the PAN is returned (no log row = no PAN), 30 views an hour per admin, no caching.

export const REVEAL_LIMIT = { scope: "kyc_pan:reveal", windowSeconds: 3600, max: 30 } as const;

export type RevealDeps = {
  env: (name: string) => string | undefined;
  getUserId: (authorization: string) => Promise<string | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  rateTake: (scope: string, keys: string[], windowSeconds: number, max: number) => Promise<number>;
  loadSealed: (providerId: string) => Promise<SealedPan | null>;
  logView: (adminId: string, providerId: string, reason: string) => Promise<void>;
};

const noStore = (r: Response): Response => {
  r.headers.set("Cache-Control", "no-store");
  return r;
};

export function createRevealHandler(deps: RevealDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const userId = await deps.getUserId(req.headers.get("Authorization") ?? "");
      if (!userId) return json({ error: "Please sign in again." }, 401);
      if (!(await deps.isAdmin(userId))) return json({ error: "Admins only." }, 403);

      const body = await readJsonObject(req);
      const providerId = asString(body.provider_id);
      const reason = asString(body.reason).trim().slice(0, 200);
      if (!isUuid(providerId)) return json({ error: "Pick a provider." }, 400);
      if (reason.length < 3) return json({ error: "Say why you need the full PAN." }, 400);

      let ring: Keyring;
      try {
        ring = await loadKeyring(deps.env);
      } catch {
        return json({ error: "PAN keys are not configured." }, 500);
      }
      const wait = await deps.rateTake(REVEAL_LIMIT.scope, [await rateKey(ring.hmac, "account", userId)], REVEAL_LIMIT.windowSeconds, REVEAL_LIMIT.max);
      if (wait > 0) return json({ error: "Too many PAN views. Try again later.", retry_after: wait }, 429);

      const sealed = await deps.loadSealed(providerId);
      if (!sealed) return json({ error: "No PAN saved for this provider." }, 404);
      const pan = await decryptPan(ring, sealed, providerId);
      await deps.logView(userId, providerId, reason);
      return noStore(json({ pan }));
    } catch (error) {
      console.error("[kyc-admin-reveal-pan]", error instanceof Error ? error.name : "error");
      return json({ error: "Could not show the PAN." }, 500);
    }
  };
}
