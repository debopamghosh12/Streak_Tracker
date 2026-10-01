import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '../../state/reducer';
import { BACKUP_KEY } from './syncedStore';
import { LocalStore, STATE_KEY } from './localStore';
import { OUTBOX_KEY } from './outbox';
import { FakeServer, makeDevice } from './testing';

const DAY = '2026-10-05'; // Monday
const NEXT = '2026-10-06';
const T0 = Date.parse('2026-10-05T08:00:00Z');

const devices: ReturnType<typeof makeDevice>[] = [];
const device = (...args: Parameters<typeof makeDevice>) => {
  const d = makeDevice(...args);
  devices.push(d);
  return d;
};
const at = (seconds: number) => vi.setSystemTime(T0 + seconds * 1000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  at(0);
});
afterEach(() => {
  for (const d of devices.splice(0)) d.store.stop();
  vi.useRealTimers();
});

describe('merge: newer updated_at wins', () => {
  it('a newer server row replaces the local row', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    const b = device(server, DAY);
    await a.start();
    await b.start();

    at(1);
    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'plan' });
    await a.store.flushNow();
    await b.store.pullNow();
    expect(b.state.days[DAY].blocks.plan).toBe(true);

    at(5);
    b.dispatch({ type: 'toggleBlock', date: DAY, id: 'apt' });
    await b.store.flushNow();
    await a.store.pullNow();
    expect(a.state.days[DAY].blocks).toEqual({ plan: true, apt: true });
  });

  it('an offline edit is not overwritten by an older server row, then uploads', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    const b = device(server, DAY);
    await a.start();
    await b.start();

    at(8);
    b.dispatch({ type: 'toggleBlock', date: DAY, id: 'java' });
    await b.store.flushNow(); // server row @ t+8

    at(10);
    a.setOnline(false);
    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'cs' }); // local @ t+10, offline
    expect(await a.store.flushNow()).toBe(false);
    expect(a.store.getStatus().mode).toBe('offline');
    expect(a.store.getStatus().pending).toBe(1);

    at(12);
    a.setOnline(true);
    await a.store.pullNow();
    expect(a.state.days[DAY].blocks).toEqual({ cs: true }); // older server row ignored
    await a.store.flushNow();
    expect(server.get('days', DAY)!.table === 'days' && (server.get('days', DAY) as { day: { blocks: object } }).day.blocks).toEqual({ cs: true });
    expect(a.store.getStatus()).toMatchObject({ mode: 'synced', pending: 0 });
  });
});

describe('outbox', () => {
  it('is persistent, coalesces edits per row and batches one upsert per table (debounced 1 s)', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    await a.start();
    server.calls = [];

    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'plan' });
    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'apt' });
    a.dispatch({ type: 'toggleTopic', topicId: 'w1-dsa', date: DAY });
    a.dispatch({ type: 'toggleTopic', topicId: 'w1-cs', date: DAY });
    expect(Object.keys(JSON.parse(a.kv.getItem(OUTBOX_KEY)!))).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(999);
    expect(server.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.calls).toEqual([
      { table: 'days', count: 1 },
      { table: 'topics_done', count: 2 },
    ]);
    expect(a.store.getStatus().pending).toBe(0);
  });

  it('retries with exponential backoff and reports the error state', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    await a.start();
    server.calls = [];
    server.failNext = 2;

    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'plan' });
    await vi.advanceTimersByTimeAsync(1000); // attempt 1 fails
    expect(a.store.getStatus().mode).toBe('error');
    await vi.advanceTimersByTimeAsync(1000); // retry after 1 s: attempt 2 fails
    expect(server.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1999); // next retry waits 2 s
    expect(server.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.calls).toHaveLength(3);
    expect(a.store.getStatus()).toMatchObject({ mode: 'synced', pending: 0 });
    expect(server.count('days')).toBe(1);
  });

  it('survives a reload: queued writes are flushed by the next session', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    await a.start();
    a.setOnline(false);
    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'plan' });
    a.store.stop();

    const reopened = device(server, DAY, { seed: Object.fromEntries(a.kv.data) });
    await reopened.start();
    await reopened.store.flushNow();
    expect(server.count('days')).toBe(1);
  });
});

describe('carry-forward across devices', () => {
  it('two devices rolling over the same day create one row per item (deterministic ids)', async () => {
    const server = new FakeServer();
    // Both devices hold Monday (only Plan done) and haven't rolled over yet.
    const seed = { [STATE_KEY]: JSON.stringify({ ...initialState(DAY), days: { [DAY]: { blocks: { plan: true } } } }) };
    const a = device(server, NEXT, { seed });
    const b = device(server, NEXT, { seed });
    await a.start();
    await b.start();

    a.dispatch({ type: 'rollover', today: NEXT });
    b.dispatch({ type: 'rollover', today: NEXT });
    expect(a.state.carried).toHaveLength(7);
    expect(b.state.carried.map((c) => c.id)).toEqual(a.state.carried.map((c) => c.id));
    await a.store.flushNow();
    await b.store.flushNow();
    expect(server.count('carried_items')).toBe(7);

    await a.store.pullNow();
    expect(a.state.carried).toHaveLength(7);
  });

  it('a drop on one device is a soft delete that reaches the other', async () => {
    const server = new FakeServer();
    // Start from a state that has Monday unfinished and has not rolled over yet.
    const seed = { [STATE_KEY]: JSON.stringify({ ...initialState(DAY), days: { [DAY]: { blocks: { plan: true } } } }) };
    const a = device(server, NEXT, { seed });
    const b = device(server, NEXT, { seed });
    await a.start();
    await b.start();
    a.dispatch({ type: 'rollover', today: NEXT });
    b.dispatch({ type: 'rollover', today: NEXT });
    expect(a.state.carried).toHaveLength(7);
    await a.store.flushNow();
    await b.store.flushNow();
    expect(server.count('carried_items')).toBe(7); // no duplicates

    at(30);
    const id = `${DAY}:ai`;
    a.dispatch({ type: 'dropCarried', id });
    await a.store.flushNow();
    const row = server.get('carried_items', id)!;
    expect(row.table === 'carried_items' && row.dropped).toBe(true);
    expect(server.count('carried_items')).toBe(7); // soft delete: row kept

    await b.store.pullNow();
    expect(b.state.carried.some((c) => c.id === id)).toBe(false);
    expect(b.state.carryDropped).toContain(id);
    b.dispatch({ type: 'rollover', today: '2026-10-07' });
    expect(b.state.carried.some((c) => c.id === id)).toBe(false);
  });
});

describe('first sign-in migration', () => {
  it('server empty: backs up, uploads everything and says so', async () => {
    const server = new FakeServer();
    const a = device(server, DAY, { signedIn: false });
    await a.start();
    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'plan' });
    a.dispatch({ type: 'toggleTopic', topicId: 'w1-dsa', date: DAY });
    a.dispatch({ type: 'updateReview', week: 1, patch: { well: 'good' } });
    expect(a.store.getStatus().mode).toBe('signedOut');

    await a.backend.signIn();
    await a.store.settled();

    expect(a.kv.getItem(BACKUP_KEY)).toContain('"plan":true');
    expect(server.count('days')).toBe(1);
    expect(server.count('topics_done')).toBe(1);
    expect(server.count('reviews')).toBe(1);
    expect(server.count('settings')).toBe(1);
    expect(a.notices).toContain('Your local data is now synced');
  });

  it('both have data: merges by updated_at and deletes nothing', async () => {
    const server = new FakeServer();
    const laptop = device(server, DAY);
    await laptop.start();
    laptop.dispatch({ type: 'toggleBlock', date: DAY, id: 'plan' });
    laptop.dispatch({ type: 'toggleBlock', date: '2026-10-03', id: 'apt' });
    await laptop.store.flushNow();

    at(20);
    // Phone has its own local data, partly overlapping, written before this release (no timestamps).
    const legacy = { ...initialState(DAY), days: { [DAY]: { blocks: { java: true } }, '2026-10-04': { sundayTasks: { contest: true } } } };
    const phone = device(server, DAY, { signedIn: false, seed: { [STATE_KEY]: JSON.stringify(legacy) } });
    await phone.start();
    await phone.backend.signIn();
    await phone.store.settled();

    expect(Object.keys(phone.state.days).sort()).toEqual(['2026-10-03', '2026-10-04', DAY]);
    expect(phone.state.days[DAY].blocks).toEqual({ plan: true }); // server row is newer than an untimestamped one
    expect(server.count('days')).toBe(3); // phone-only day uploaded, nothing removed
    expect(JSON.parse(phone.kv.getItem(BACKUP_KEY)!).days[DAY].blocks).toEqual({ java: true });
    expect(phone.notices).toContain('This device is merged with your synced data');
  });
});

describe('storage layer', () => {
  it('the local snapshot mirrors app state after every change (survives reload)', async () => {
    const server = new FakeServer();
    const a = device(server, NEXT, { signedIn: false });
    await a.start();
    a.dispatch({ type: 'toggleBlock', date: DAY, id: 'dsa1' });
    a.dispatch({ type: 'addCustom', date: DAY, task: { id: 'c-1', text: 'x', subject: 'cs', done: false } });
    a.dispatch({ type: 'rollover', today: NEXT });
    a.dispatch({ type: 'toggleCarried', id: `${DAY}:c-1`, date: NEXT });
    a.dispatch({ type: 'dropCarried', id: `${DAY}:ai` });
    a.dispatch({ type: 'toggleTopic', topicId: 'w1-ai', date: NEXT });
    a.dispatch({ type: 'toggleTopic', topicId: 'w1-ai', date: NEXT });
    a.dispatch({ type: 'updateReview', week: 1, patch: { aiBuilt: true } });

    const reloaded = new LocalStore(a.kv, () => NEXT).load();
    const sortCarried = <T extends { carried: { id: string }[] }>(s: T) => ({ ...s, carried: [...s.carried].sort((x, y) => x.id.localeCompare(y.id)) });
    expect(sortCarried(reloaded)).toEqual(sortCarried(a.state));
  });

  it('import writes through the storage layer, so it syncs', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    await a.start();
    a.dispatch({ type: 'import', today: DAY, state: { ...initialState(DAY), days: { [DAY]: { blocks: { plan: true } } }, topicsDone: { 'w1-dsa': DAY } } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.count('days')).toBe(1);
    expect(server.count('topics_done')).toBe(1);
  });

  it('runs local-only without a backend', () => {
    const local = new LocalStore(makeDevice(new FakeServer(), DAY).kv, () => DAY);
    expect(local.load().days).toEqual({});
  });
});

describe('plan sync', () => {
  it('plan_weeks and plan_phases sync between devices, newer wins, deletes are soft', async () => {
    const server = new FakeServer();
    const a = device(server, DAY);
    const b = device(server, DAY);
    await a.start();
    await b.start();

    at(1);
    a.dispatch({ type: 'upsertPlanPhase', phase: { id: 'p1', name: 'Offers', startWeek: 14, endWeek: null } });
    a.dispatch({ type: 'upsertPlanWeek', week: { weekNumber: 14, phaseId: 'p1', topics: { dsa: 'Graphs', java: null, cs: null, ai: null, apt: null } } });
    await a.store.flushNow();
    await b.store.pullNow();
    expect(b.state.plan.weeks['14'].topics.dsa).toBe('Graphs');
    expect(b.state.plan.phases.p1.name).toBe('Offers');

    at(5);
    b.dispatch({ type: 'upsertPlanWeek', week: { ...b.state.plan.weeks['14'], topics: { ...b.state.plan.weeks['14'].topics, dsa: 'Graphs II' } } });
    await b.store.flushNow();
    await a.store.pullNow();
    expect(a.state.plan.weeks['14'].topics.dsa).toBe('Graphs II');

    at(9);
    a.dispatch({ type: 'deletePlanWeek', weekNumber: 14 });
    await a.store.flushNow();
    const row = server.get('plan_weeks', '14')!;
    expect(row.table === 'plan_weeks' && row.deleted).toBe(true);
    expect(server.count('plan_weeks')).toBe(1); // soft delete keeps the row
    await b.store.pullNow();
    expect(b.state.plan.weeks['14']).toBeUndefined();
  });

  it('first sign-in uploads local plan weeks', async () => {
    const server = new FakeServer();
    const a = device(server, DAY, { signedIn: false });
    await a.start();
    a.dispatch({ type: 'upsertPlanWeek', week: { weekNumber: 15, phaseId: null, topics: { dsa: 'DP', java: null, cs: null, ai: null, apt: null } } });
    await a.backend.signIn();
    await a.store.settled();
    expect(server.count('plan_weeks')).toBe(1);
    expect(a.notices).toContain('Your local data is now synced');
  });
});
