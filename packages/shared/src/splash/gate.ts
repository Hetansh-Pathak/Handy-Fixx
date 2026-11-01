/**
 * Timing rules of the animated opening screen (UI only). The screen plays WHILE fonts, theme and the session load, and leaves
 * only when BOTH the animation has finished AND the app is ready. Pure, so it is tested; the component just feeds it the clock.
 */
export const SPLASH_ANIMATION_MS = 2500;
/** Reduced motion: the final frame is shown at once and held for this long. */
export const SPLASH_REDUCED_MS = 600;
/** If the app is still loading after this long, the final frame stays and a small spinner appears. */
export const SPLASH_SPINNER_AFTER_MS = 3500;
/** The cross-fade into the first route. */
export const SPLASH_FADE_MS = 200;

export type SplashState =
  | { phase: "playing"; showSpinner: false }
  | { phase: "holding"; showSpinner: boolean }
  | { phase: "leave"; showSpinner: false };

/** `elapsedMs` since the splash mounted. */
export function splashState(input: { elapsedMs: number; ready: boolean; reducedMotion: boolean }): SplashState {
  const playMs = input.reducedMotion ? SPLASH_REDUCED_MS : SPLASH_ANIMATION_MS;
  if (input.elapsedMs < playMs) return { phase: "playing", showSpinner: false };
  if (input.ready) return { phase: "leave", showSpinner: false };
  return { phase: "holding", showSpinner: input.elapsedMs >= SPLASH_SPINNER_AFTER_MS };
}

/** Cold start only (the JS process outlives a trip to the background), and never when a test or build turns it off. */
export function shouldShowSplash(input: { alreadyShown: boolean; skip: boolean }): boolean {
  return !input.alreadyShown && !input.skip;
}
