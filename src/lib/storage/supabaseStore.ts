import type { SupabaseClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';
import { emptyReview, sanitizeCarried, sanitizeDay } from '../../state/reducer';
import type { ReviewRecord } from '../../state/types';
import { supabase } from '../supabase';
import type { PulledRecord, RemoteBackend, RemoteUser, SyncRecord, TableName } from './types';

/** Fixed namespace for carried-item ids. Never change it: ids must match across devices. */
const CARRIED_NS = '4b6f2f9e-5d0b-4c43-9a4e-0f6d8f0c2a71';

/**
 * Server id of a carried item: uuid v5 of (user id + local id), where the local id is
 * "<sourceDate>:<sourceBlockId>". Two devices rolling over the same day produce the same id,
 * so upserts collapse into one row. The user id keeps ids unique across accounts.
 */
export const carriedUuid = (userId: string, localId: string) => uuidv5(`${userId}:${localId}`, CARRIED_NS);

const CONFLICT: Record<TableName, string> = {
  days: 'user_id,date',
  carried_items: 'id',
  topics_done: 'user_id,topic_id',
  reviews: 'user_id,week',
  settings: 'user_id',
};

const KEY_COLUMNS: Record<TableName, string> = {
  days: 'date',
  carried_items: 'source_date,source_block_id',
  topics_done: 'topic_id',
  reviews: 'week',
  settings: 'user_id',
};

type Row = Record<string, unknown>;
const PAGE = 1000;

const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function toRow(r: SyncRecord, userId: string): Row {
  switch (r.table) {
    case 'days':
      return { user_id: userId, date: r.key, data: r.day };
    case 'carried_items':
      return {
        id: carriedUuid(userId, r.item.id),
        user_id: userId,
        source_date: r.item.sourceDate,
        source_block_id: r.item.sourceBlockId,
        text: r.item.text,
        subject: r.item.subject,
        current_day: r.item.currentDate,
        moves: r.item.moves,
        done: r.item.done,
        completed_on: r.item.completedOn ?? null,
        dropped: r.dropped,
      };
    case 'topics_done':
      return { user_id: userId, topic_id: r.key, done_on: r.doneOn };
    case 'reviews':
      return { user_id: userId, week: Number(r.key), data: r.review };
    case 'settings':
      return { user_id: userId, data: r.settings };
  }
}

export function rowKey(table: TableName, row: Row): string {
  switch (table) {
    case 'days':
      return String(row.date);
    case 'carried_items':
      return `${row.source_date}:${row.source_block_id}`;
    case 'topics_done':
      return String(row.topic_id);
    case 'reviews':
      return String(row.week);
    case 'settings':
      return 'settings';
  }
}

/** Server row -> app record, validated like any other untrusted input. Null when malformed. */
export function fromRow(table: TableName, row: Row): PulledRecord | null {
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null;
  if (!updatedAt) return null;
  const key = rowKey(table, row);
  switch (table) {
    case 'days':
      return isDate(row.date) && isObj(row.data) ? { table, key, day: sanitizeDay(row.data), updatedAt } : null;
    case 'carried_items': {
      const item = sanitizeCarried({
        id: key,
        sourceDate: row.source_date,
        sourceBlockId: row.source_block_id,
        text: row.text,
        subject: row.subject,
        currentDate: row.current_day,
        moves: row.moves,
        done: row.done,
        completedOn: row.completed_on,
      });
      return item ? { table, key, item, dropped: !!row.dropped, updatedAt } : null;
    }
    case 'topics_done':
      return { table, key, doneOn: isDate(row.done_on) ? row.done_on : null, updatedAt };
    case 'reviews':
      return isObj(row.data) ? { table, key, review: { ...emptyReview(), ...(row.data as Partial<ReviewRecord>) }, updatedAt } : null;
    case 'settings': {
      const data = isObj(row.data) ? row.data : {};
      return isDate(data.rolledThrough)
        ? { table, key: 'settings', settings: { version: 2, rolledThrough: data.rolledThrough }, updatedAt }
        : null;
    }
  }
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): RemoteUser | null =>
  u ? { id: u.id, email: u.email ?? '' } : null;

/** Supabase implementation of the sync backend. Returns null when env vars are missing. */
export function createSupabaseBackend(client: SupabaseClient | null = supabase): RemoteBackend | null {
  if (!client) return null;
  let userId: string | null = null;

  const requireUser = () => {
    if (!userId) throw new Error('Not signed in');
    return userId;
  };

  return {
    async getUser() {
      const { data } = await client.auth.getSession();
      const user = toUser(data.session?.user);
      userId = user?.id ?? null;
      return user;
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = toUser(session?.user);
        userId = user?.id ?? null;
        // Defer: calling Supabase from inside this callback can deadlock the auth lock.
        setTimeout(() => cb(user), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, redirectTo) {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
      if (error) throw error;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      userId = null;
      if (error) throw error;
    },

    async upsert(table, records) {
      const uid = requireUser();
      const rows = records.map((r) => toRow(r, uid));
      const { data, error } = await client
        .from(table)
        .upsert(rows, { onConflict: CONFLICT[table] })
        .select(`${KEY_COLUMNS[table]},updated_at`);
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).map((row) => ({ key: rowKey(table, row), updatedAt: String(row.updated_at) }));
    },

    async pull(table, since) {
      const uid = requireUser();
      const out: PulledRecord[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = client.from(table).select('*').eq('user_id', uid).order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as Row[];
        for (const row of rows) {
          const rec = fromRow(table, row);
          if (rec) out.push(rec);
        }
        if (rows.length < PAGE) break;
      }
      return out;
    },
  };
}
