import { describe, it, expect } from 'vitest';
import { totalsOf, weekBuckets, monthBuckets, groupByDay, dayLabel, greeting, inr } from '@/lib/earningsView';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

describe('earningsView', () => {
  it('splits totals by status', () => {
    const t = totalsOf([
      { provider_amount: 100, status: 'pending', created_at: '' }, { provider_amount: '50', status: 'paid', created_at: '' },
      { provider_amount: 25, status: 'processing', created_at: '' },
    ]);
    expect(t).toEqual({ lifetime: 175, available: 100, awaitingPayment: 0, processing: 25, paid: 50 });
  });
  it('week buckets end on today and use local days', () => {
    const now = new Date(2026, 9, 5, 0, 30); // 00:30 local: UTC-based code would put this on the wrong day
    const w = weekBuckets([{ provider_amount: 300, created_at: at(2026, 9, 5, 0) }, { provider_amount: 90, created_at: at(2026, 9, 4, 23) }], now);
    expect(w).toHaveLength(7);
    expect(w[6]).toMatchObject({ isToday: true, amount: 300 });
    expect(w[5].amount).toBe(90);
  });
  it('month buckets survive the 31st', () => {
    const m = monthBuckets([{ provider_amount: 10, created_at: at(2026, 7, 15) }], new Date(2026, 9, 31), 6);
    expect(m.map(x => x.m)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(m[3].amount).toBe(10);
    expect(m[5].isCurrent).toBe(true);
  });
  it('groups newest first with day totals', () => {
    const now = new Date(2026, 9, 5, 15);
    const g = groupByDay([
      { created_at: at(2026, 9, 4, 9), provider_amount: 50 }, { created_at: at(2026, 9, 5, 10), provider_amount: 100 }, { created_at: at(2026, 9, 5, 14), provider_amount: 20 },
    ], now);
    expect(g.map(x => x.label)).toEqual(['Today', 'Yesterday']);
    expect(g[0].total).toBe(120);
    expect(g[0].items[0].provider_amount).toBe(20);
  });
  it('labels and formats', () => {
    expect(dayLabel(new Date(2026, 9, 5), new Date(2026, 9, 5, 23))).toBe('Today');
    expect(greeting(8)).toBe('Good morning'); expect(greeting(23)).toBe('Working late');
    expect(inr(12345.6)).toBe('₹12,346');
  });
});

describe('totalsOf: payable gating', () => {
  const row = (provider_amount: number, status: string, payable?: boolean | null) =>
    ({ provider_amount, status, created_at: '2026-10-01T00:00:00Z', payable });
  it('only counts paid-by-customer rows as withdrawable', () => {
    const t = totalsOf([row(400, 'pending', true), row(300, 'pending', false), row(200, 'pending'), row(100, 'processing', true)]);
    expect(t.available).toBe(600);          // payable + legacy (no flag)
    expect(t.awaitingPayment).toBe(300);
    expect(t.processing).toBe(100);
    expect(t.lifetime).toBe(1000);
  });
});
