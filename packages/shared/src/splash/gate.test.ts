import { describe, expect, it } from "vitest";
import { shouldShowSplash, SPLASH_ANIMATION_MS, SPLASH_FADE_MS, SPLASH_REDUCED_MS, SPLASH_SPINNER_AFTER_MS, splashState } from "./gate";

describe("splashState", () => {
  it("plays for the whole animation even when the app is ready at once", () => {
    expect(splashState({ elapsedMs: 0, ready: true, reducedMotion: false })).toEqual({ phase: "playing", showSpinner: false });
    expect(splashState({ elapsedMs: SPLASH_ANIMATION_MS - 1, ready: true, reducedMotion: false }).phase).toBe("playing");
  });
  it("leaves as soon as the animation is done AND the app is ready", () => {
    expect(splashState({ elapsedMs: SPLASH_ANIMATION_MS, ready: true, reducedMotion: false }).phase).toBe("leave");
    expect(splashState({ elapsedMs: 9000, ready: true, reducedMotion: false }).phase).toBe("leave");
  });
  it("holds the final frame while the app is still loading, with no spinner at first", () => {
    expect(splashState({ elapsedMs: SPLASH_ANIMATION_MS, ready: false, reducedMotion: false })).toEqual({ phase: "holding", showSpinner: false });
    expect(splashState({ elapsedMs: SPLASH_SPINNER_AFTER_MS - 1, ready: false, reducedMotion: false }).showSpinner).toBe(false);
  });
  it("shows a small spinner after 3.5 s of waiting, and still leaves the moment the app is ready", () => {
    expect(splashState({ elapsedMs: SPLASH_SPINNER_AFTER_MS, ready: false, reducedMotion: false })).toEqual({ phase: "holding", showSpinner: true });
    expect(splashState({ elapsedMs: 12000, ready: true, reducedMotion: false }).phase).toBe("leave");
  });
  it("reduced motion: the final frame for about 600 ms, then leave when ready", () => {
    expect(SPLASH_REDUCED_MS).toBe(600);
    expect(splashState({ elapsedMs: 599, ready: true, reducedMotion: true }).phase).toBe("playing");
    expect(splashState({ elapsedMs: 600, ready: true, reducedMotion: true }).phase).toBe("leave");
    expect(splashState({ elapsedMs: 600, ready: false, reducedMotion: true }).phase).toBe("holding");
  });
  it("the animation is shorter than the 3.5 s cap and the fade is 200 ms", () => {
    expect(SPLASH_ANIMATION_MS).toBeLessThan(SPLASH_SPINNER_AFTER_MS);
    expect(SPLASH_FADE_MS).toBe(200);
  });
});

describe("shouldShowSplash", () => {
  it("plays on a cold start only", () => {
    expect(shouldShowSplash({ alreadyShown: false, skip: false })).toBe(true);
    expect(shouldShowSplash({ alreadyShown: true, skip: false })).toBe(false);
  });
  it("can be switched off (browser tests, store screenshots)", () => {
    expect(shouldShowSplash({ alreadyShown: false, skip: true })).toBe(false);
  });
});
