import type { CarriedItem, TrackerState } from '../../state/types';
import type { TrackerStorage } from './types';

type Sink = Pick<TrackerStorage, 'saveDay' | 'saveCarried' | 'saveTopicDone' | 'saveReview' | 'saveSettings' | 'savePlanWeek' | 'savePlanPhase'>;

/** A carried item known only by its id (v1 tombstones): enough to sync a soft delete. */
export function tombstoneItem(id: string): CarriedItem {
  const i = id.indexOf(':');
  const sourceDate = id.slice(0, i);
  return { id, sourceDate, sourceBlockId: id.slice(i + 1), text: '', subject: null, currentDate: sourceDate, moves: 1, done: false };
}

/**
 * Persists exactly what changed between two states. The reducer only replaces objects it
 * touched, so reference equality finds the changed days, carried items, topics and reviews.
 */
export function persistDiff(prev: TrackerState, next: TrackerState, sink: Sink) {
  if (prev === next) return;

  if (prev.days !== next.days) {
    for (const [date, day] of Object.entries(next.days)) if (prev.days[date] !== day) sink.saveDay(date, day);
  }

  if (prev.carried !== next.carried || prev.carryDropped !== next.carryDropped) {
    const prevById = new Map(prev.carried.map((c) => [c.id, c]));
    const nextIds = new Set(next.carried.map((c) => c.id));
    const nextDropped = new Set(next.carryDropped);
    for (const c of next.carried) if (prevById.get(c.id) !== c) sink.saveCarried(c, 'active');
    for (const c of prev.carried) if (!nextIds.has(c.id)) sink.saveCarried(c, nextDropped.has(c.id) ? 'dropped' : 'removed');
    const prevDropped = new Set(prev.carryDropped);
    for (const id of next.carryDropped) {
      if (!prevDropped.has(id) && !prevById.has(id)) sink.saveCarried(tombstoneItem(id), 'dropped');
    }
  }

  if (prev.topicsDone !== next.topicsDone) {
    for (const [id, on] of Object.entries(next.topicsDone)) if (prev.topicsDone[id] !== on) sink.saveTopicDone(id, on);
    for (const id of Object.keys(prev.topicsDone)) if (!(id in next.topicsDone)) sink.saveTopicDone(id, null);
  }

  if (prev.reviews !== next.reviews) {
    for (const [week, r] of Object.entries(next.reviews)) if (prev.reviews[week] !== r) sink.saveReview(week, r);
  }

  if (prev.plan !== next.plan) {
    const pw = prev.plan.weeks;
    const nw = next.plan.weeks;
    if (pw !== nw) {
      for (const [k, w] of Object.entries(nw)) if (pw[k] !== w) sink.savePlanWeek(w);
      for (const [k, w] of Object.entries(pw)) if (!(k in nw)) sink.savePlanWeek(w, true);
    }
    const pp = prev.plan.phases;
    const np = next.plan.phases;
    if (pp !== np) {
      for (const [k, p] of Object.entries(np)) if (pp[k] !== p) sink.savePlanPhase(p);
      for (const [k, p] of Object.entries(pp)) if (!(k in np)) sink.savePlanPhase(p, true);
    }
  }

  if (prev.rolledThrough !== next.rolledThrough) {
    sink.saveSettings({ version: 2, rolledThrough: next.rolledThrough });
  }
}
