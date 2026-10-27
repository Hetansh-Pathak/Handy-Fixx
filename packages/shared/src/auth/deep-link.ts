export type AuthLinkParams = {
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** PKCE flow code (not used by the implicit flow this project runs on, parsed for safety). */
  code: string | null;
  error: string | null;
};

const decode = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
};

function parsePairs(chunk: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of chunk.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const key = decode(i === -1 ? part : part.slice(0, i));
    if (key && !(key in out)) out[key] = decode(i === -1 ? "" : part.slice(i + 1));
  }
  return out;
}

/**
 * Reads the auth parameters Supabase appends to a deep link such as
 * `handyfix://reset-password#access_token=…&refresh_token=…&type=recovery`.
 * Values come from the URL fragment first (implicit flow), then the query string.
 */
export function parseAuthLink(url: string | null | undefined): AuthLinkParams {
  const empty: AuthLinkParams = { type: null, accessToken: null, refreshToken: null, code: null, error: null };
  if (!url) return empty;
  const hashAt = url.indexOf("#");
  const fragment = hashAt === -1 ? "" : url.slice(hashAt + 1);
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);
  const p = { ...parsePairs(query), ...parsePairs(fragment) };
  return {
    type: p.type ?? null,
    accessToken: p.access_token ?? null,
    refreshToken: p.refresh_token ?? null,
    code: p.code ?? null,
    error: p.error_description ?? p.error ?? null,
  };
}

/** A usable recovery link carries both tokens (or a PKCE code) and says it is a recovery. */
export const isRecoveryLink = (p: AuthLinkParams) =>
  p.type === "recovery" && ((!!p.accessToken && !!p.refreshToken) || !!p.code);
