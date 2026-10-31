import { asString, corsHeaders, json, readJsonObject } from "../_shared/http.ts";
import { rateKey } from "../_shared/otp.ts";
import {
  blindIndex, encryptPan, isValidPan, loadKeyring, normalizePan, optionalBlindIndex, panLast4, type Keyring,
} from "../_shared/pan-crypto.ts";

// PROPOSAL 20261125000001 (finding H3), NOT DEPLOYED. The only place a pro's PAN is accepted.
//   { action: "save", pan }      -> encrypts the PAN and stores it with its blind index; answers { pan_last4 } only.
//   { action: "prepare_submit" } -> refreshes the phone / bank-name blind indexes from the pro's current profile and
//                                   checks the blocklist; the app calls it right before submit_kyc.
// The full PAN never leaves this function and is never logged.

export const PAN_SAVE_LIMIT = { scope: "kyc_pan:save", windowSeconds: 3600, max: 10 } as const;
const EDITABLE = new Set(["not_submitted", "rejected"]);

export type KycProvider = { id: string; kyc_status: string; phone: string | null; bank_account_name: string | null };

export type KycPanDeps = {
  env: (name: string) => string | undefined;
  getUserId: (authorization: string) => Promise<string | null>;
  getProvider: (userId: string) => Promise<KycProvider | null>;
  rateTake: (scope: string, keys: string[], windowSeconds: number, max: number) => Promise<number>;
  blocklistHit: (pan: string | null, phone: string | null, bankName: string | null) => Promise<boolean>;
  /** The provider id that already holds this PAN blind index, if any. */
  panHolder: (panBlindIndex: string) => Promise<string | null>;
  /** Upserts the server-only columns. Returns "duplicate" on the unique blind-index index. */
  savePan: (providerId: string, v: { pan_encrypted: string; pan_nonce: string; pan_key_version: number; pan_last4: string;
    pan_blind_index: string; phone_blind_index: string | null; bank_name_blind_index: string | null }) => Promise<"ok" | "duplicate">;
  saveIdentifiers: (providerId: string, v: { phone_blind_index: string | null; bank_name_blind_index: string | null }) => Promise<string | null>;
};

const DUPLICATE = "This PAN is already linked to another provider account. Check the number, or contact support if you think this is a mistake.";
const BLOCKED = "We cannot accept this application. Please contact apnabanda support.";

export function createKycPanHandler(deps: KycPanDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      let ring: Keyring;
      try {
        ring = await loadKeyring(deps.env);
      } catch {
        return json({ error: "PAN saving is not switched on yet. Ask the apnabanda team." }, 500);
      }
      const userId = await deps.getUserId(req.headers.get("Authorization") ?? "");
      if (!userId) return json({ error: "Please sign in again." }, 401);
      const provider = await deps.getProvider(userId);
      if (!provider) return json({ error: "Provider account not found." }, 403);
      if (!EDITABLE.has(provider.kyc_status)) return json({ error: "Your application can no longer be edited. It may already be under review." }, 409);

      const body = await readJsonObject(req);
      const action = asString(body.action) || "save";
      const phoneIdx = await optionalBlindIndex(ring, "phone", provider.phone);
      const bankIdx = await optionalBlindIndex(ring, "bank_account_name", provider.bank_account_name);

      if (action === "prepare_submit") {
        const panIdx = await deps.saveIdentifiers(provider.id, { phone_blind_index: phoneIdx, bank_name_blind_index: bankIdx });
        if (await deps.blocklistHit(panIdx, phoneIdx, bankIdx)) return json({ error: BLOCKED }, 403);
        return json({ ok: true });
      }
      if (action !== "save") return json({ error: "Unknown action" }, 400);

      const pan = normalizePan(asString(body.pan));
      if (!isValidPan(pan)) return json({ error: "PAN format is ABCDE1234F: 5 letters, 4 digits, 1 letter." }, 400);

      // Each answer says whether a PAN is already registered, so the number of tries is limited.
      const wait = await deps.rateTake(PAN_SAVE_LIMIT.scope, [await rateKey(ring.hmac, "account", provider.id)],
        PAN_SAVE_LIMIT.windowSeconds, PAN_SAVE_LIMIT.max);
      if (wait > 0) return json({ error: "Too many tries. Please wait and try again later.", retry_after: wait }, 429);

      const panIdx = await blindIndex(ring, "pan", pan);
      if (await deps.blocklistHit(panIdx, phoneIdx, bankIdx)) return json({ error: BLOCKED }, 403);
      const holder = await deps.panHolder(panIdx);
      if (holder && holder !== provider.id) return json({ error: DUPLICATE }, 409);

      const sealed = await encryptPan(ring, pan, provider.id);
      const result = await deps.savePan(provider.id, {
        pan_encrypted: sealed.ciphertext, pan_nonce: sealed.nonce, pan_key_version: sealed.version, pan_last4: panLast4(pan),
        pan_blind_index: panIdx, phone_blind_index: phoneIdx, bank_name_blind_index: bankIdx,
      });
      if (result === "duplicate") return json({ error: DUPLICATE }, 409);
      return json({ pan_last4: panLast4(pan) });
    } catch (error) {
      console.error("[kyc-pan]", error instanceof Error ? error.name : "error");
      return json({ error: "We could not save your PAN. Please try again." }, 500);
    }
  };
}
