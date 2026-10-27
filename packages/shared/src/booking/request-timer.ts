/** Seconds a provider has to accept a request before the customer is offered other pros. */
export const REQUEST_TIMEOUT_SECONDS = 30;

export function secondsRemaining(sentAt: Date, now: Date, timeout = REQUEST_TIMEOUT_SECONDS): number {
  const elapsed = (now.getTime() - sentAt.getTime()) / 1000;
  return Math.min(timeout, Math.max(0, Math.ceil(timeout - elapsed)));
}

export const isRequestExpired = (sentAt: Date, now: Date, timeout = REQUEST_TIMEOUT_SECONDS) =>
  secondsRemaining(sentAt, now, timeout) === 0;

/** 0..1 for the countdown ring (1 = full time left). */
export const requestProgress = (sentAt: Date, now: Date, timeout = REQUEST_TIMEOUT_SECONDS) =>
  secondsRemaining(sentAt, now, timeout) / timeout;
