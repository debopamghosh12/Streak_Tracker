import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { emptyDay } from '../../state/reducer';
import { carriedUuid, createSupabaseBackend, fromRow, toRow } from './supabaseStore';
import type { SyncRecord } from './types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const item = {
  id: '2026-10-05:dsa2',
  sourceDate: '2026-10-05',
  sourceBlockId: 'dsa2',
  text: 'DSA block 2 — 2 more problems',
  subject: 'dsa' as const,
  currentDate: '2026-10-06',
  moves: 2,
  done: false,
};

describe('carried item ids', () => {
  it('are deterministic per user and differ across users', () => {
    expect(carriedUuid(USER_A, item.id)).toBe(carriedUuid(USER_A, item.id));
    expect(carriedUuid(USER_A, item.id)).not.toBe(carriedUuid(USER_B, item.id));
    expect(carriedUuid(USER_A, item.id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('row mapping', () => {
  it('round-trips every table through the SQL row shape', () => {
    const records: SyncRecord[] = [
      { table: 'days', key: '2026-10-05', day: { ...emptyDay(), blocks: { plan: true }, dsa: 3 } },
      { table: 'carried_items', key: item.id, item, dropped: true },
      { table: 'topics_done', key: 'w1-dsa', doneOn: '2026-10-05' },
      { table: 'topics_done', key: 'w1-cs', doneOn: null },
      { table: 'reviews', key: '1', review: { javaShipped: true, aiBuilt: false, well: 'w', slipped: '', change: '' } },
      { table: 'settings', key: 'settings', settings: { version: 2, rolledThrough: '2026-10-04' } },
      { table: 'plan_phases', key: 'p1', phase: { id: 'p1', name: 'Offers', startWeek: 14, endWeek: null, goal: 'Convert', dsaGoal: 450 }, deleted: false },
      {
        table: 'plan_weeks',
        key: '14',
        week: { weekNumber: 14, phaseId: 'p1', topics: { dsa: 'Graphs', java: null, cs: null, ai: null, apt: null }, targets: { dsa: '35 problems' } },
        deleted: true,
      },
    ];
    for (const r of records) {
      const row: Record<string, unknown> = { ...toRow(r, USER_A), updated_at: '2026-10-05T10:00:00.123456+00:00' };
      expect(row.user_id).toBe(USER_A);
      expect(fromRow(r.table, row)).toEqual({ ...r, updatedAt: row.updated_at });
    }
    const carriedRow = toRow(records[1], USER_A);
    expect(carriedRow).toMatchObject({ id: carriedUuid(USER_A, item.id), current_day: '2026-10-06', dropped: true });
    expect(carriedRow).not.toHaveProperty('current_date');
  });

  it('rejects malformed server rows', () => {
    expect(fromRow('days', { date: 'nope', data: {}, updated_at: '2026-10-05T10:00:00Z' })).toBeNull();
    expect(fromRow('days', { date: '2026-10-05', data: {} })).toBeNull();
    expect(fromRow('settings', { data: { rolledThrough: 5 }, updated_at: '2026-10-05T10:00:00Z' })).toBeNull();
  });
});

describe('createSupabaseBackend', () => {
  it('treats a missing plan table as empty on pull (002 not run yet)', async () => {
    const missing = { code: 'PGRST205', message: "Could not find the table 'public.plan_weeks' in the schema cache" };
    const query = { eq: () => query, order: () => query, range: () => query, gt: () => query, then: (r: (v: unknown) => void) => r({ data: null, error: missing }) };
    const client = {
      from: () => ({ select: () => query }),
      auth: { getSession: async () => ({ data: { session: { user: { id: USER_A } } } }) },
    } as unknown as SupabaseClient;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = createSupabaseBackend(client)!;
    await backend.getUser();
    await expect(backend.pull('plan_weeks', null)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('002_plan_extension.sql'));
    warn.mockRestore();
  });

  it('returns null (local-only mode) without a client', () => {
    expect(createSupabaseBackend(null)).toBeNull();
  });

  it('upserts with the right conflict target and maps acks back to local keys', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ source_date: '2026-10-05', source_block_id: 'dsa2', updated_at: '2026-10-05T10:00:01Z' }],
      error: null,
    });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = {
      from,
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: USER_A, email: 'me@example.com' } } } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    } as unknown as SupabaseClient;

    const backend = createSupabaseBackend(client)!;
    expect(await backend.getUser()).toEqual({ id: USER_A, email: 'me@example.com' });
    const acks = await backend.upsert('carried_items', [{ table: 'carried_items', key: item.id, item, dropped: false }]);

    expect(from).toHaveBeenCalledWith('carried_items');
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'id' });
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ id: carriedUuid(USER_A, item.id), user_id: USER_A, source_block_id: 'dsa2' });
    expect(acks).toEqual([{ key: item.id, updatedAt: '2026-10-05T10:00:01Z' }]);
  });

  it('throws on server errors so the outbox retries', async () => {
    const client = {
      from: () => ({ upsert: () => ({ select: async () => ({ data: null, error: new Error('JWT expired') }) }) }),
      auth: { getSession: async () => ({ data: { session: { user: { id: USER_A } } } }) },
    } as unknown as SupabaseClient;
    const backend = createSupabaseBackend(client)!;
    await backend.getUser();
    await expect(backend.upsert('days', [{ table: 'days', key: '2026-10-05', day: emptyDay() }])).rejects.toThrow('JWT expired');
  });
});
