// Runs the REAL code of the KYC functions and the one-time migration script (proposal 20261125000001) against fakes:
// AES-256-GCM round trip, tampering, wrong key, nonce uniqueness, key rotation, the pro / admin / retention handlers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blindIndex, blindIndexInput, decryptPan, encryptPan, isValidPan, loadKeyring, normalizeBankName, normalizePan, normalizePhone, panLast4,
} from "../../../proposals/functions/_shared/pan-crypto.ts";
import { createKycPanHandler, PAN_SAVE_LIMIT, type KycPanDeps, type KycProvider } from "../../../proposals/functions/kyc-pan/handler.ts";
import { createRevealHandler, REVEAL_LIMIT, type RevealDeps } from "../../../proposals/functions/kyc-admin-reveal-pan/handler.ts";
import { createRetentionHandler, type RetentionDeps } from "../../../proposals/functions/kyc-retention/handler.ts";
import { migrateKyc, type KycRow, type MigrateDeps } from "../../../proposals/scripts/kyc-migrate-pan-core.ts";

const b64 = (fill: number) => Buffer.alloc(32, fill).toString("base64");
const envOf = (over: Record<string, string | undefined> = {}) => {
  const base: Record<string, string | undefined> = { KYC_PAN_KEY: b64(1), KYC_PAN_HMAC_KEY: b64(9), KYC_RETENTION_SECRET: "r".repeat(40) };
  const all = { ...base, ...over };
  return (n: string) => all[n];
};
const PAN = "ABCDE1234F";
const PRO = "11111111-1111-1111-1111-111111111111";
const OTHER_PRO = "22222222-2222-2222-2222-222222222222";
const ADMIN = "99999999-9999-9999-9999-999999999999";

test("PAN rules: normalise, validate, last 4", () => {
  assert.equal(normalizePan(" abcde-1234 f "), PAN);
  assert.ok(isValidPan(PAN));
  for (const bad of ["ABCDE1234", "ABCD1234FF", "1BCDE1234F", "ABCDE12345", "", "ABCDE1234f"]) assert.ok(!isValidPan(bad), bad);
  assert.equal(panLast4("abcde1234f"), "234F");
  // These strings are what the app's shared package also produces (packages/shared/src/kyc/pan.test.ts).
  assert.equal(blindIndexInput("pan", " abcde 1234 f"), "pan|v1|ABCDE1234F");
  assert.equal(blindIndexInput("phone", "+91 98250-12345"), "phone|v1|9825012345");
  assert.equal(blindIndexInput("bank_account_name", "  Ravi  K. Patel "), "bank_account_name|v1|RAVI K PATEL");
  assert.equal(normalizePhone("098250 12345"), "9825012345");
  assert.equal(normalizeBankName("shri-ram"), "SHRI RAM");
});

test("round trip: encrypt then decrypt returns the PAN; the stored value shows nothing", async () => {
  const ring = await loadKeyring(envOf());
  const sealed = await encryptPan(ring, "abcde1234f", PRO);
  assert.equal(sealed.version, 1);
  assert.ok(!Buffer.from(sealed.ciphertext, "base64").toString("latin1").includes("ABCDE"));
  assert.equal(Buffer.from(sealed.nonce, "base64").length, 12, "96-bit nonce");
  assert.equal(Buffer.from(sealed.ciphertext, "base64").length, 10 + 16, "10 PAN bytes + 16-byte GCM tag");
  assert.equal(await decryptPan(ring, sealed, PRO), PAN);
  await assert.rejects(() => encryptPan(ring, "not-a-pan", PRO));
});

test("GCM: a changed ciphertext, nonce or provider id fails to decrypt", async () => {
  const ring = await loadKeyring(envOf());
  const s = await encryptPan(ring, PAN, PRO);
  const flip = (b64s: string, at: number) => { const b = Buffer.from(b64s, "base64"); b[at] = b[at]! ^ 1; return b.toString("base64"); };
  await assert.rejects(() => decryptPan(ring, { ...s, ciphertext: flip(s.ciphertext, 0) }, PRO), "flipped data bit");
  await assert.rejects(() => decryptPan(ring, { ...s, ciphertext: flip(s.ciphertext, 12) }, PRO), "flipped tag bit");
  await assert.rejects(() => decryptPan(ring, { ...s, nonce: flip(s.nonce, 3) }, PRO), "changed nonce");
  await assert.rejects(() => decryptPan(ring, s, OTHER_PRO), "copied onto another pro's row");
  await assert.rejects(() => decryptPan(ring, { ...s, version: 7 }, PRO), "unknown key version");
});

test("a wrong key cannot decrypt", async () => {
  const sealed = await encryptPan(await loadKeyring(envOf()), PAN, PRO);
  await assert.rejects(async () => decryptPan(await loadKeyring(envOf({ KYC_PAN_KEY: b64(2) })), sealed, PRO));
});

test("a nonce is never reused (20,000 encryptions of the same PAN)", async () => {
  const ring = await loadKeyring(envOf());
  const nonces = new Set<string>(), cipher = new Set<string>();
  for (let i = 0; i < 20_000; i++) {
    const s = await encryptPan(ring, PAN, PRO);
    nonces.add(s.nonce);
    cipher.add(s.ciphertext);
  }
  assert.equal(nonces.size, 20_000);
  assert.equal(cipher.size, 20_000, "same PAN never gives the same ciphertext");
});

test("key rotation: old rows still open, new rows use the new key", async () => {
  const oldRing = await loadKeyring(envOf());                                            // version 1
  const oldRow = await encryptPan(oldRing, PAN, PRO);
  const rotated = await loadKeyring(envOf({ KYC_PAN_KEY: b64(2), KYC_PAN_KEY_VERSION: "2", KYC_PAN_KEY_V1: b64(1) }));
  assert.equal(await decryptPan(rotated, oldRow, PRO), PAN, "version 1 row read with the version 2 ring");
  const fresh = await encryptPan(rotated, PAN, PRO);
  assert.equal(fresh.version, 2);
  assert.equal(await decryptPan(rotated, fresh, PRO), PAN);
  await assert.rejects(() => decryptPan(oldRing, fresh, PRO), "the old ring cannot read new rows");
  const forgotten = await loadKeyring(envOf({ KYC_PAN_KEY: b64(2), KYC_PAN_KEY_VERSION: "2" }));
  await assert.rejects(() => decryptPan(forgotten, oldRow, PRO), "without KYC_PAN_KEY_V1 old rows cannot be read");
});

test("keys: refuses missing, short or malformed secrets", async () => {
  await assert.rejects(() => loadKeyring(envOf({ KYC_PAN_KEY: undefined })));
  await assert.rejects(() => loadKeyring(envOf({ KYC_PAN_KEY: Buffer.alloc(16).toString("base64") })));
  await assert.rejects(() => loadKeyring(envOf({ KYC_PAN_KEY: Buffer.alloc(48, 1).toString("base64") })), "AES-256 needs exactly 32 bytes");
  await assert.rejects(() => loadKeyring(envOf({ KYC_PAN_HMAC_KEY: undefined })));
  await assert.rejects(() => loadKeyring(envOf({ KYC_PAN_KEY_VERSION: "0" })));
  await assert.rejects(() => loadKeyring(envOf({ KYC_PAN_KEY: "!!not base64!!" })));
});

test("blind index: stable for the same PAN in any spelling, different for another PAN or another key", async () => {
  const ring = await loadKeyring(envOf());
  const a = await blindIndex(ring, "pan", "ABCDE1234F");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await blindIndex(ring, "pan", " abcde-1234f "), a);
  assert.notEqual(await blindIndex(ring, "pan", "ABCDE1234G"), a);
  assert.notEqual(await blindIndex(await loadKeyring(envOf({ KYC_PAN_HMAC_KEY: b64(8) })), "pan", PAN), a);
  assert.notEqual(await blindIndex(ring, "phone", "ABCDE1234F"), a, "kinds are separated");
});

// ── kyc-pan ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
function panWorld(over: { env?: ReturnType<typeof envOf>; provider?: KycProvider | null; blocked?: boolean; holder?: string | null; dupOnSave?: boolean } = {}) {
  const saved: Record<string, unknown>[] = [];
  const identifiers: Record<string, unknown>[] = [];
  const counts = new Map<string, number>();
  const provider = "provider" in over ? over.provider : { id: PRO, kyc_status: "not_submitted", phone: "+91 98250 12345", bank_account_name: "Ravi Patel" };
  const deps: KycPanDeps = {
    env: over.env ?? envOf(),
    getUserId: async (a) => (a === "Bearer pro" ? "user-1" : null),
    getProvider: async () => provider ?? null,
    rateTake: async (scope, keys, _w, max) => { const k = scope + keys.join(); const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n > max ? 99 : 0; },
    blocklistHit: async () => over.blocked === true,
    panHolder: async () => over.holder ?? null,
    savePan: async (_id, v) => { if (over.dupOnSave) return "duplicate"; saved.push(v); return "ok"; },
    saveIdentifiers: async (_id, v) => { identifiers.push(v); return "b".repeat(64); },
  };
  const call = (body: unknown, auth = "Bearer pro") => createKycPanHandler(deps)(new Request("http://x/", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify(body) }));
  return { saved, identifiers, call };
}
const read = async (r: Response) => ({ status: r.status, text: await r.clone().text(), json: (await r.json()) as Record<string, unknown> });

test("kyc-pan: saves encrypted, answers with the last 4 only, the PAN is nowhere in the response or the stored values", async () => {
  const w = panWorld();
  const r = await read(await w.call({ action: "save", pan: "abcde 1234 f" }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { pan_last4: "234F" });
  assert.ok(!r.text.includes("ABCDE"));
  assert.equal(w.saved.length, 1);
  const row = w.saved[0]!;
  assert.ok(!JSON.stringify(row).includes("ABCDE1234F"), "no plain PAN in what is stored");
  assert.equal(row.pan_key_version, 1);
  assert.match(String(row.pan_blind_index), /^[0-9a-f]{64}$/);
  assert.match(String(row.phone_blind_index), /^[0-9a-f]{64}$/, "phone blind index filled from the profile");
  assert.match(String(row.bank_name_blind_index), /^[0-9a-f]{64}$/);
  const ring = await loadKeyring(envOf());
  assert.equal(await decryptPan(ring, { ciphertext: String(row.pan_encrypted), nonce: String(row.pan_nonce), version: 1 }, PRO), PAN);
});

test("kyc-pan: refusals", async () => {
  assert.equal((await panWorld().call({ pan: PAN }, "")).status, 401);
  assert.equal((await panWorld({ provider: null }).call({ pan: PAN })).status, 403);
  assert.equal((await panWorld({ provider: { id: PRO, kyc_status: "pending", phone: null, bank_account_name: null } }).call({ pan: PAN })).status, 409, "under review: no edits");
  assert.equal((await panWorld({ provider: { id: PRO, kyc_status: "approved", phone: null, bank_account_name: null } }).call({ pan: PAN })).status, 409);
  assert.equal((await panWorld().call({ pan: "nope" })).status, 400);
  assert.equal((await panWorld().call({ action: "steal", pan: PAN })).status, 400);
  assert.equal((await panWorld({ blocked: true }).call({ pan: PAN })).status, 403, "blocklisted");
  assert.equal((await panWorld({ holder: OTHER_PRO }).call({ pan: PAN })).status, 409, "PAN already on another account");
  assert.equal((await panWorld({ dupOnSave: true }).call({ pan: PAN })).status, 409, "race: unique index catches it");
  assert.equal((await panWorld({ env: envOf({ KYC_PAN_KEY: undefined }) }).call({ pan: PAN })).status, 500, "no key, no saving");
  const same = await panWorld({ holder: PRO }).call({ pan: PAN });
  assert.equal(same.status, 200, "the same pro can save their own PAN again");
});

test("kyc-pan: limited tries, and prepare_submit refreshes the identifiers and checks the blocklist", async () => {
  const w = panWorld();
  const statuses: number[] = [];
  for (let i = 0; i < PAN_SAVE_LIMIT.max + 2; i++) statuses.push((await w.call({ pan: PAN })).status);
  assert.deepEqual(statuses.slice(-2), [429, 429]);

  const p = panWorld();
  assert.equal((await p.call({ action: "prepare_submit" })).status, 200);
  assert.equal(p.identifiers.length, 1);
  assert.equal((await panWorld({ blocked: true }).call({ action: "prepare_submit" })).status, 403);
});

// ── kyc-admin-reveal-pan ─────────────────────────────────────────────────────────────────────────────────────────────────
async function revealWorld(over: { admin?: boolean; logFails?: boolean; sealed?: boolean } = {}) {
  const ring = await loadKeyring(envOf());
  const sealed = await encryptPan(ring, PAN, PRO);
  const log: { adminId: string; providerId: string; reason: string }[] = [];
  const counts = new Map<string, number>();
  const events: string[] = [];
  const deps: RevealDeps = {
    env: envOf(),
    getUserId: async (a) => (a === "Bearer admin" ? ADMIN : null),
    isAdmin: async () => over.admin !== false,
    rateTake: async (s, k, _w, max) => { const key = s + k.join(); const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return n > max ? 5 : 0; },
    loadSealed: async (id) => (over.sealed === false || id !== PRO ? null : sealed),
    logView: async (adminId, providerId, reason) => { events.push("log"); if (over.logFails) throw new Error("db down"); log.push({ adminId, providerId, reason }); },
  };
  const call = (body: unknown, auth = "Bearer admin") => createRevealHandler(deps)(new Request("http://x/", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify(body) }));
  return { log, call, events };
}

test("reveal: an admin gets the PAN, the view is logged with who / which pro / why, and the answer is not cacheable", async () => {
  const w = await revealWorld();
  const res = await w.call({ provider_id: PRO, reason: "support call 441" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { pan: PAN });
  assert.deepEqual(w.log, [{ adminId: ADMIN, providerId: PRO, reason: "support call 441" }]);
});

test("reveal: not for non-admins, signed-out callers, or without a reason; no log = no PAN", async () => {
  const none = await revealWorld({ admin: false });
  const r1 = await read(await none.call({ provider_id: PRO, reason: "curious" }));
  assert.equal(r1.status, 403);
  assert.ok(!r1.text.includes(PAN));
  const w = await revealWorld();
  assert.equal((await w.call({ provider_id: PRO, reason: "why not" }, "")).status, 401);
  assert.equal((await w.call({ provider_id: PRO })).status, 400, "reason required");
  assert.equal((await w.call({ provider_id: "bad", reason: "abc" })).status, 400);
  assert.equal((await w.call({ provider_id: OTHER_PRO, reason: "abc" })).status, 404);
  const broken = await revealWorld({ logFails: true });
  const r2 = await read(await broken.call({ provider_id: PRO, reason: "abc" }));
  assert.equal(r2.status, 500);
  assert.ok(!r2.text.includes(PAN), "if the log cannot be written the PAN is not shown");
});

test("reveal: 30 views an hour per admin", async () => {
  const w = await revealWorld();
  let refused = 0;
  for (let i = 0; i < REVEAL_LIMIT.max + 3; i++) if ((await w.call({ provider_id: PRO, reason: "audit" })).status === 429) refused++;
  assert.equal(refused, 3);
});

// ── kyc-retention ────────────────────────────────────────────────────────────────────────────────────────────────────────
function retentionWorld(rows: { provider_id: string; paths: string[] }[], opts: { removeOk?: boolean } = {}) {
  const removed: string[][] = [];
  const done: { id: string; paths: string[] }[] = [];
  let pending = [...rows];
  const deps: RetentionDeps = {
    env: envOf(),
    due: async () => pending,
    removeFiles: async (p) => { removed.push(p); return opts.removeOk !== false; },
    markDone: async (id, paths) => { done.push({ id, paths }); pending = pending.filter((r) => r.provider_id !== id); return paths.length; },
  };
  const call = (secret?: string, method = "POST") => createRetentionHandler(deps)(new Request("http://x/", { method, headers: secret ? { "x-retention-secret": secret } : {} }));
  return { removed, done, call };
}

test("retention: needs the shared secret; deletes the listed files then marks them done", async () => {
  const w = retentionWorld([{ provider_id: PRO, paths: [`${PRO}/aadhaar_front_1.jpg`, `${PRO}/aadhaar_back_1.jpg`] }]);
  assert.equal((await w.call()).status, 401);
  assert.equal((await w.call("wrong".repeat(10))).status, 401);
  assert.equal((await w.call("r".repeat(40), "GET")).status, 405);
  assert.equal(w.removed.length, 0, "nothing deleted without the secret");
  const ok = await read(await w.call("r".repeat(40)));
  assert.deepEqual(ok.json, { ok: true, providers: 1, files: 2, failed: 0 });
  assert.equal(w.removed.length, 1);
  assert.equal(w.done.length, 1);
});

test("retention: a failed file deletion does not mark the pro done; path tricks are skipped; a short secret disables the job", async () => {
  const failing = retentionWorld([{ provider_id: PRO, paths: ["a/aadhaar_front_1.jpg"] }], { removeOk: false });
  const r = await read(await failing.call("r".repeat(40)));
  assert.equal(r.json.ok, false);
  assert.equal(failing.done.length, 0);
  const tricky = retentionWorld([{ provider_id: PRO, paths: ["../other/aadhaar_front.jpg", ""] }]);
  await tricky.call("r".repeat(40));
  assert.equal(tricky.removed.length, 0);
  const weak = createRetentionHandler({ ...({} as RetentionDeps), env: () => "short" });
  assert.equal((await weak(new Request("http://x/", { method: "POST", headers: { "x-retention-secret": "short" } }))).status, 500);
});

// ── one-time migration script ───────────────────────────────────────────────────────────────────────────────────────────
function row(over: Partial<KycRow>): KycRow {
  return { provider_id: PRO, user_id: "u1", phone: "9825012345", bank_account_name: "Ravi Patel", pan_number: PAN, pan_encrypted: null, pan_nonce: null,
    pan_key_version: null, pan_blind_index: null, aadhaar_last4: "1234", aadhaar_hash: "h", aadhaar_front_path: "u1/aadhaar_front_1.jpg",
    aadhaar_back_path: null, ...over };
}
function migrateWorld(rows: KycRow[]) {
  const db = new Map(rows.map((r) => [r.provider_id, { ...r }]));
  const files = new Set<string>(["u1/aadhaar_front_1.jpg", "u1/aadhaar_front_0.jpg", "u1/selfie_1.jpg", "u1/pan_1.jpg", "u2/aadhaar_back_9.jpg"]);
  let writes = 0;
  const deps: MigrateDeps = {
    listRows: async () => [...db.values()].map((r) => ({ ...r })),
    listAadhaarFiles: async (uid) => [...files].filter((f) => f.startsWith(`${uid}/aadhaar_`)),
    removeFiles: async (paths) => { writes++; for (const p of paths) files.delete(p); },
    updateRow: async (id, patch) => { writes++; Object.assign(db.get(id)!, patch); },
  };
  return { db, files, deps, writes: () => writes };
}

test("migration: a dry run changes nothing and reports what it would do", async () => {
  const ring = await loadKeyring(envOf());
  const w = migrateWorld([row({})]);
  const rep = await migrateKyc(w.deps, ring, { apply: false });
  assert.equal(w.writes(), 0);
  assert.equal(rep.panEncrypted, 1);
  assert.equal(rep.aadhaarFilesDeleted, 2, "the saved path and the older retake");
  assert.equal(w.db.get(PRO)!.pan_number, PAN);
});

test("migration: --apply encrypts every PAN, clears plain + Aadhaar data, deletes Aadhaar files only, and is idempotent", async () => {
  const ring = await loadKeyring(envOf());
  const second = row({ provider_id: OTHER_PRO, user_id: "u2", pan_number: "VWXYZ5678K", aadhaar_hash: null, aadhaar_last4: null, aadhaar_front_path: null, aadhaar_back_path: "u2/aadhaar_back_9.jpg" });
  const w = migrateWorld([row({}), second]);
  const rep = await migrateKyc(w.deps, ring, { apply: true });
  assert.equal(rep.panEncrypted, 2);
  const a = w.db.get(PRO)!;
  assert.equal(a.pan_number, null);
  assert.equal(a.aadhaar_hash, null);
  assert.equal(a.aadhaar_front_path, null);
  assert.equal(a.pan_key_version, 1);
  assert.equal(await decryptPan(ring, { ciphertext: a.pan_encrypted!, nonce: a.pan_nonce!, version: 1 }, PRO), PAN);
  assert.equal(a.pan_blind_index, await blindIndex(ring, "pan", PAN));
  assert.deepEqual([...w.files].sort(), ["u1/pan_1.jpg", "u1/selfie_1.jpg"], "selfie and PAN photo kept, every Aadhaar file gone");

  const writesBefore = w.writes();
  const again = await migrateKyc(w.deps, ring, { apply: true });
  assert.equal(w.writes(), writesBefore, "second run writes nothing");
  assert.equal(again.panEncrypted + again.panPlainCleared + again.aadhaarFilesDeleted + again.aadhaarRowsCleared, 0);
  assert.equal(again.panAlreadyDone, 2);
});

test("migration: invalid, duplicate and mismatched PANs are reported and left for a person", async () => {
  const ring = await loadKeyring(envOf());
  const w = migrateWorld([
    row({ provider_id: "p1", user_id: "x1", pan_number: "BAD" }),
    row({ provider_id: "p2", user_id: "x2", pan_number: PAN }),
    row({ provider_id: "p3", user_id: "x3", pan_number: PAN }),
  ]);
  const rep = await migrateKyc(w.deps, ring, { apply: true });
  assert.deepEqual(rep.panInvalid, ["p1"]);
  assert.deepEqual(rep.panDuplicate, ["p3"]);
  assert.equal(w.db.get("p1")!.pan_number, "BAD", "left alone");
  assert.equal(w.db.get("p3")!.pan_number, PAN, "left alone");
  assert.equal(w.db.get("p2")!.pan_number, null);

  // a row encrypted earlier whose plain copy does not match is NOT cleared
  const sealedForOther = await encryptPan(ring, "VWXYZ5678K", "m1");
  const m = migrateWorld([row({ provider_id: "m1", user_id: "y1", pan_number: PAN, pan_encrypted: sealedForOther.ciphertext, pan_nonce: sealedForOther.nonce, pan_key_version: 1, pan_blind_index: "c".repeat(64) })]);
  const rep2 = await migrateKyc(m.deps, ring, { apply: true });
  assert.deepEqual(rep2.panMismatch, ["m1"]);
  assert.equal(m.db.get("m1")!.pan_number, PAN);
});
