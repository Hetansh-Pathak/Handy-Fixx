import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createHandyFixClient } from "./client";
import { callEdge } from "./edge";

describe("createHandyFixClient", () => {
  it("fails loudly instead of silently using a fake project", () => {
    expect(() => createHandyFixClient({ url: undefined, anonKey: "k" })).toThrow(/not configured/);
    expect(() => createHandyFixClient({ url: "https://x.supabase.co", anonKey: " " })).toThrow(/not configured/);
    expect(() => createHandyFixClient({ url: "http://x.supabase.co", anonKey: "k" })).toThrow(/https/);
  });
  it("creates a client for valid config", () => {
    const c = createHandyFixClient({ url: "https://abc.supabase.co", anonKey: "anon" });
    expect(typeof c.from).toBe("function");
    expect(typeof c.auth.getSession).toBe("function");
  });
});

const clientReturning = (result: { data?: unknown; error?: unknown }) =>
  ({ functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null, ...result }) } }) as unknown as SupabaseClient;

describe("callEdge", () => {
  it("returns data on success", async () => {
    await expect(callEdge(clientReturning({ data: { ok: true } }), "fn", {})).resolves.toEqual({ ok: true });
  });
  it("throws a reply-level { error } even on HTTP 200", async () => {
    await expect(callEdge(clientReturning({ data: { error: "Already paid" } }), "fn", {})).rejects.toThrow("Already paid");
  });
  it("prefers the function's own error body over the generic message", async () => {
    const error = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Wallet too low" }) } };
    await expect(callEdge(clientReturning({ error }), "fn", {})).rejects.toThrow("Wallet too low");
  });
  it("reads the gateway's { message } shape", async () => {
    const error = { message: "generic", context: { json: async () => ({ message: "Invalid JWT" }) } };
    await expect(callEdge(clientReturning({ error }), "fn", {})).rejects.toThrow("Invalid JWT");
  });
  it("falls back to the default message if the body can't be read", async () => {
    const error = { message: "generic", context: { json: async () => { throw new Error("bad json"); } } };
    await expect(callEdge(clientReturning({ error }), "fn", {})).rejects.toThrow("generic");
  });
  it("passes the body through", async () => {
    const client = clientReturning({ data: {} });
    await callEdge(client, "create-wallet-topup-order", { amount: 100 });
    expect(client.functions.invoke).toHaveBeenCalledWith("create-wallet-topup-order", { body: { amount: 100 } });
  });
});
