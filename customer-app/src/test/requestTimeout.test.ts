import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestTimeoutSignal } from "@/lib/requestTimeout";

describe("createRequestTimeoutSignal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the request when its timeout expires", async () => {
    vi.useFakeTimers();
    const request = createRequestTimeoutSignal(undefined, 2500);

    await vi.advanceTimersByTimeAsync(2500);

    expect(request.signal.aborted).toBe(true);
    expect(request.signal.reason).toMatchObject({ name: "TimeoutError" });
    request.clear();
  });

  it("propagates cancellation from its parent signal", () => {
    const parent = new AbortController();
    const request = createRequestTimeoutSignal(parent.signal);

    parent.abort();

    expect(request.signal.aborted).toBe(true);
    request.clear();
  });
});
