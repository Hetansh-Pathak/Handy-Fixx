import type { SupabaseClient } from "@supabase/supabase-js";

/** Calls an Edge Function and turns any failure into a readable Error. */
export async function callEdge<T>(client: SupabaseClient, name: string, body: unknown): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as unknown as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = (await ctx.json()) as { error?: unknown; message?: unknown } | null;
        // Our functions reply { error }; the Supabase gateway replies { message } (e.g. "Invalid JWT").
        const detail = parsed?.error ?? parsed?.message;
        if (detail) message = typeof detail === "string" ? detail : JSON.stringify(detail);
      }
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  const replyError = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
  if (typeof replyError === "string" && replyError) throw new Error(replyError);
  return data as T;
}
