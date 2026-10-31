import {
  blindIndex, decryptPan, encryptPan, isValidPan, normalizePan, optionalBlindIndex, panLast4, type Keyring,
} from "../functions/_shared/pan-crypto.ts";

// One-time KYC migration for proposal 20261125000001 (finding H3). The logic only; kyc-migrate-pan.ts wires it to the
// live project. Dry run unless `apply` is true. Idempotent: a second run finds nothing left to do.
//   1. Every plain pan_number is encrypted (AES-256-GCM) with its blind index, and the plain value is cleared in the
//      SAME update, so a crash can never leave a PAN only in plain text or lose it.
//      A row already encrypted whose plain value is still there is checked (decrypt == plain) before clearing it.
//      Invalid or duplicate PANs are reported and left alone for a person to fix.
//   2. Every Aadhaar value is cleared and every Aadhaar photo is deleted (the paths on the row plus any older
//      retake named aadhaar_* in the pro's folder), files first.

export type KycRow = {
  provider_id: string;
  user_id: string | null;
  phone: string | null;
  bank_account_name: string | null;
  pan_number: string | null;
  pan_encrypted: string | null;
  pan_nonce: string | null;
  pan_key_version: number | null;
  pan_blind_index: string | null;
  aadhaar_last4: string | null;
  aadhaar_hash: string | null;
  aadhaar_front_path: string | null;
  aadhaar_back_path: string | null;
};

export type MigrateDeps = {
  listRows: () => Promise<KycRow[]>;
  /** Full object paths (`<user id>/aadhaar_...`) in the provider-kyc bucket for this user. */
  listAadhaarFiles: (userId: string) => Promise<string[]>;
  removeFiles: (paths: string[]) => Promise<void>;
  updateRow: (providerId: string, patch: Record<string, string | number | null>) => Promise<void>;
};

export type MigrateReport = {
  apply: boolean;
  rows: number;
  panEncrypted: number;
  panPlainCleared: number;
  panAlreadyDone: number;
  panInvalid: string[];
  panDuplicate: string[];
  panMismatch: string[];
  aadhaarRowsCleared: number;
  aadhaarFilesDeleted: number;
};

const AADHAAR_COLUMNS = ["aadhaar_last4", "aadhaar_hash", "aadhaar_front_path", "aadhaar_back_path"] as const;

export async function migrateKyc(deps: MigrateDeps, ring: Keyring, opts: { apply: boolean }): Promise<MigrateReport> {
  const report: MigrateReport = {
    apply: opts.apply, rows: 0, panEncrypted: 0, panPlainCleared: 0, panAlreadyDone: 0,
    panInvalid: [], panDuplicate: [], panMismatch: [], aadhaarRowsCleared: 0, aadhaarFilesDeleted: 0,
  };
  const rows = await deps.listRows();
  report.rows = rows.length;

  // Blind index -> provider, starting with rows that are already encrypted.
  const holders = new Map<string, string>();
  for (const r of rows) if (r.pan_blind_index) holders.set(r.pan_blind_index, r.provider_id);

  for (const r of rows) {
    // ── PAN ──
    if (r.pan_number) {
      const pan = normalizePan(r.pan_number);
      if (!isValidPan(pan)) {
        report.panInvalid.push(r.provider_id);
      } else if (r.pan_encrypted && r.pan_nonce && r.pan_key_version) {
        let same = false;
        try {
          same = (await decryptPan(ring, { ciphertext: r.pan_encrypted, nonce: r.pan_nonce, version: r.pan_key_version }, r.provider_id)) === pan;
        } catch {
          same = false;
        }
        if (!same) report.panMismatch.push(r.provider_id);
        else {
          report.panPlainCleared++;
          if (opts.apply) await deps.updateRow(r.provider_id, { pan_number: null });
        }
      } else {
        const idx = await blindIndex(ring, "pan", pan);
        const holder = holders.get(idx);
        if (holder && holder !== r.provider_id) {
          report.panDuplicate.push(r.provider_id);
        } else {
          holders.set(idx, r.provider_id);
          report.panEncrypted++;
          if (opts.apply) {
            const sealed = await encryptPan(ring, pan, r.provider_id);
            await deps.updateRow(r.provider_id, {
              pan_encrypted: sealed.ciphertext, pan_nonce: sealed.nonce, pan_key_version: sealed.version,
              pan_last4: panLast4(pan), pan_blind_index: idx,
              phone_blind_index: await optionalBlindIndex(ring, "phone", r.phone),
              bank_name_blind_index: await optionalBlindIndex(ring, "bank_account_name", r.bank_account_name),
              pan_number: null,
            });
          }
        }
      }
    } else if (r.pan_encrypted) {
      report.panAlreadyDone++;
    }

    // ── Aadhaar ──
    const listed = r.user_id ? await deps.listAadhaarFiles(r.user_id) : [];
    const files = [...new Set([r.aadhaar_front_path, r.aadhaar_back_path, ...listed].filter((p): p is string => !!p))];
    const hasValues = AADHAAR_COLUMNS.some((c) => r[c] !== null);
    if (files.length || hasValues) {
      report.aadhaarRowsCleared += hasValues ? 1 : 0;
      report.aadhaarFilesDeleted += files.length;
      if (opts.apply) {
        if (files.length) await deps.removeFiles(files);
        if (hasValues) await deps.updateRow(r.provider_id, Object.fromEntries(AADHAAR_COLUMNS.map((c) => [c, null])));
      }
    }
  }
  return report;
}
