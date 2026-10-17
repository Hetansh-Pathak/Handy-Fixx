// Shared CORS helper. Set the ALLOWED_ORIGINS secret (comma-separated) in production:
//   supabase secrets set ALLOWED_ORIGINS=https://handyfix.in,https://provider.handyfix.in,https://admin.handyfix.in
// If unset, falls back to "*" (development only) and logs a warning.
declare const Deno: { env: { get: (name: string) => string | undefined } };

const BASE_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const getCorsHeaders = (req: Request): Record<string, string> => {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (allowed.length === 0) {
    console.warn("[cors] ALLOWED_ORIGINS is not set; allowing all origins. Set it in production.");
    return { ...BASE_HEADERS, "Access-Control-Allow-Origin": "*" };
  }
  const origin = req.headers.get("Origin") ?? "";
  return {
    ...BASE_HEADERS,
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Vary": "Origin",
  };
};

export const makeJson = (cors: Record<string, string>) => (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
