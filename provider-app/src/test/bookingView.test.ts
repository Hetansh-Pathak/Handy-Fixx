import { describe, it, expect } from 'vitest';
import { tabOf, statusLabel, earningsOf, whenLabel, parseLocalDate, defaultTab } from '@/lib/bookingView';

describe('bookingView', () => {
  it('puts each status in exactly one tab', () => {
    expect(tabOf('pending')).toBe('new');
    expect(tabOf('confirmed')).toBe('upcoming');
    expect(tabOf('on_the_way')).toBe('active');
    expect(tabOf('in_progress')).toBe('active');
    expect(tabOf('completed')).toBe('done');
    expect(tabOf('cancelled')).toBe('cancelled');
  });
  it('labels arrived (eta 0) differently from on the way', () => {
    expect(statusLabel('on_the_way', 0)).toBe('Arrived');
    expect(statusLabel('on_the_way', 12)).toBe('On the way');
  });
  it('computes earnings with fallbacks', () => {
    expect(earningsOf({ provider_amount: 400, total_amount: 500 })).toBe(400);
    expect(earningsOf({ total_amount: 500, platform_fee: 49 })).toBe(451);
    expect(earningsOf({})).toBeNull();
  });
  it('parses date-only strings as local days', () => {
    const d = parseLocalDate('2026-10-05')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 5]);
    expect(parseLocalDate(null)).toBeNull();
  });
  it('labels today/tomorrow/yesterday', () => {
    const now = new Date(2026, 9, 5, 10, 0);
    expect(whenLabel('2026-10-05', '16:30', now)).toMatch(/^Today, 4:30/);
    expect(whenLabel('2026-10-06', '09:00', now)).toMatch(/^Tomorrow/);
    expect(whenLabel('2026-10-04', null, now)).toBe('Yesterday');
    expect(whenLabel(null, null, now)).toBe('Time not set');
  });
  it('opens on the most urgent non-empty tab', () => {
    expect(defaultTab({ new: 2, upcoming: 1, active: 1, done: 5, cancelled: 0 })).toBe('active');
    expect(defaultTab({ new: 2, upcoming: 1, active: 0, done: 5, cancelled: 0 })).toBe('new');
    expect(defaultTab({ new: 0, upcoming: 0, active: 0, done: 0, cancelled: 0 })).toBe('new');
  });
});
