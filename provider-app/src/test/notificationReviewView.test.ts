import { describe, expect, it } from 'vitest';
import { dayGroup, groupByDay, kindOf, matchesFilter, routeOfKind, timeLabel, toneOfKind } from '@/lib/notificationView';
import { applyFilter, shortName, summarize } from '@/lib/reviewView';

const now = new Date(2026, 9, 5, 15, 0);
describe('notificationView', () => {
  it('maps types to kind, tone and route', () => {
    expect(kindOf('new_booking')).toBe('booking');
    expect(kindOf('weird')).toBe('other');
    expect(toneOfKind('cancelled')).toBe('red');
    expect(routeOfKind('payment')).toBe('/provider-panel/earnings');
    expect(routeOfKind('other')).toBeNull();
  });
  it('groups by local day, not UTC', () => {
    expect(dayGroup(new Date(2026, 9, 5, 0, 5).toISOString(), now)).toBe('Today');
    expect(dayGroup(new Date(2026, 9, 4, 23, 55).toISOString(), now)).toBe('Yesterday');
    expect(dayGroup(new Date(2026, 9, 1).toISOString(), now)).toBe('Earlier');
  });
  it('drops empty groups and keeps order', () => {
    const g = groupByDay([{ created_at: new Date(2026, 9, 1).toISOString() }, { created_at: new Date(2026, 9, 5, 9).toISOString() }], now);
    expect(g.map(x => x.label)).toEqual(['Today', 'Earlier']);
  });
  it('filters bookings to include cancellations', () => {
    expect(matchesFilter({ type: 'booking_cancelled' }, 'booking')).toBe(true);
    expect(matchesFilter({ type: 'payment', is_read: true }, 'unread')).toBe(false);
  });
  it('labels time', () => {
    expect(timeLabel(new Date(2026, 9, 5, 14, 58).toISOString(), now)).toBe('2 min ago');
    expect(timeLabel(new Date(2026, 9, 4, 12).toISOString(), now)).toBe('Yesterday');
  });
});
describe('reviewView', () => {
  const rows = [
    { id: 'a', rating: 5, comment: 'Great', created_at: '2026-10-01T10:00:00Z' },
    { id: 'b', rating: 3, comment: ' ', created_at: '2026-10-03T10:00:00Z' },
    { id: 'c', rating: 4, comment: null, created_at: '2026-10-02T10:00:00Z' },
  ];
  it('summarises from the loaded reviews', () => {
    const s = summarize(rows);
    expect(s.total).toBe(3); expect(s.avg).toBeCloseTo(4);
    expect(s.bars[0]).toEqual({ star: 5, count: 1, pct: 33 });
    expect(summarize([]).avg).toBe(0);
  });
  it('filters and sorts without mutating input', () => {
    expect(applyFilter(rows, 'low', 'latest').map(r => r.id)).toEqual(['b']);
    expect(applyFilter(rows, 'comments', 'latest').map(r => r.id)).toEqual(['a']);
    expect(applyFilter(rows, 'all', 'highest').map(r => r.id)).toEqual(['a', 'c', 'b']);
    expect(rows[0].id).toBe('a');
  });
  it('shortens names', () => {
    expect(shortName('Priya Sharma')).toBe('Priya S.');
    expect(shortName('')).toBe('Customer');
    expect(shortName('a.b@mail.com')).toBe('Customer');
  });
});

import { dayKey, formatTime, nextFreeRange, summarizeDay, todayISO, validateRange, weekTotals } from '@/lib/scheduleView';
describe('scheduleView', () => {
  it('formats 12-hour times, incl. noon/midnight and HH:MM:SS', () => {
    expect(formatTime('09:00')).toBe('9:00 AM'); expect(formatTime('12:30:00')).toBe('12:30 PM');
    expect(formatTime('00:15')).toBe('12:15 AM'); expect(formatTime('')).toBe('--');
  });
  it('validates ranges', () => {
    expect(validateRange('09:00', '17:00', [])).toBeNull();
    expect(validateRange('17:00', '09:00', [])).toMatch(/after/);
    expect(validateRange('09:00', '09:30', [])).toMatch(/1 hour/);
    expect(validateRange('12:00', '15:00', [{ start_time: '09:00', end_time: '13:00' }])).toMatch(/overlaps/);
    expect(validateRange('13:00', '17:00', [{ start_time: '09:00', end_time: '13:00' }])).toBeNull(); // touching is fine
  });
  it('finds the next free window', () => {
    expect(nextFreeRange([])).toEqual({ start_time: '09:00', end_time: '13:00' });
    expect(nextFreeRange([{ start_time: '09:00', end_time: '13:00' }])).toEqual({ start_time: '13:00', end_time: '17:00' });
    expect(nextFreeRange([{ start_time: '09:00', end_time: '21:30' }])).toBeNull();
  });
  it('summarises a day and the week', () => {
    const rows = [{ id: '1', start_time: '13:00', end_time: '17:00', is_available: true, day_of_week: 'monday' }, { id: '2', start_time: '09:00', end_time: '12:00', is_available: true, day_of_week: 'monday' }, { id: '3', start_time: '09:00', end_time: '17:00', is_available: false, day_of_week: 'sunday' }];
    expect(summarizeDay(rows)).toBe('9:00 AM – 12:00 PM, 1:00 PM – 5:00 PM');
    expect(summarizeDay([])).toBe('Day off');
    expect(weekTotals(rows)).toEqual({ days: 1, hours: 7 });
  });
  it('uses LOCAL date and weekday', () => {
    const d = new Date(2026, 9, 5, 1, 0); // Mon 5 Oct 01:00 local: UTC date would be the 4th in IST
    expect(todayISO(d)).toBe('2026-10-05'); expect(dayKey(d)).toBe('monday');
    expect(dayKey(new Date(2026, 9, 4))).toBe('sunday');
  });
});
