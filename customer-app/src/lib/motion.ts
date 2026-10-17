/** One motion language for the whole app. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const rise = (i = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: 0.04 * i },
});

export const haptic = (ms = 8) => {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
};
