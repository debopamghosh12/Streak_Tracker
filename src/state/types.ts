import type { CounterField, SubjectId } from '../data/plan';

/** A subject, or null for "Other" (e.g. Plan / Recall). */
export type TaskSubject = SubjectId | null;

/** Per-date edit of a planned block or Sunday task. The base plan never changes. */
export interface Override {
  text: string;
  start?: string; // HH:mm
  end?: string;
  subject: TaskSubject;
}

export interface CustomTask {
  id: string;
  text: string;
  start?: string;
  end?: string;
  subject: TaskSubject;
  done: boolean;
}

export interface CarriedItem {
  /** Stable id: "<sourceDate>:<sourceBlockId>" — never duplicated. */
  id: string;
  sourceDate: string;
  /** Block id, Sunday task id or custom task id on the source date. */
  sourceBlockId: string;
  text: string;
  subject: TaskSubject;
  currentDate: string;
  moves: number;
  done: boolean;
  completedOn?: string;
}

export interface DayRecord {
  blocks: Record<string, boolean>;
  sundayTasks: Record<string, boolean>;
  dsa: number;
  apps: number;
  hours: number;
  /** True when hours were entered by hand; otherwise the app uses the auto value from ticked blocks. */
  hoursManual: boolean;
  topicsCovered: string[];
  morning: string;
  night: string;
  frozen: boolean;
  overrides: Record<string, Override>;
  /** task id -> reason ('' when none given). Removed from the day's list and streak denominator. */
  skipped: Record<string, string>;
  customTasks: CustomTask[];
  /** Planned tasks the user pushed to tomorrow via Delete → "Move to tomorrow". Still count as unfinished today. */
  movedOut: string[];
}

/** Topic text per subject for a week; null = not set yet. */
export type WeekTopics = Record<SubjectId, string | null>;

/** A user-defined (or user-edited) week. Same weekNumber as a base week = override. */
export interface UserWeek {
  weekNumber: number;
  /** Explicit phase; null = whichever phase's week range contains it. */
  phaseId: string | null;
  topics: WeekTopics;
  /** Optional custom weekly target text per subject (defaults to the standard five). */
  targets?: Partial<Record<SubjectId, string>>;
}

/** A user-defined phase. endWeek null = open-ended. */
export interface UserPhase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number | null;
  goal?: string;
  /** Running DSA problem target to reach by the end of this phase. */
  dsaGoal?: number;
}

export interface UserPlan {
  /** keyed by String(weekNumber) */
  weeks: Record<string, UserWeek>;
  phases: Record<string, UserPhase>;
}

export interface ReviewRecord {
  javaShipped: boolean;
  aiBuilt: boolean;
  well: string;
  slipped: string;
  change: string;
}

export interface TrackerState {
  days: Record<string, DayRecord>;
  /** topicId -> ISO date (yyyy-mm-dd) it was completed */
  topicsDone: Record<string, string>;
  carried: CarriedItem[];
  /** Carried ids the user dropped — tombstones so rollover never recreates them. */
  carryDropped: string[];
  /** Last past date whose unfinished tasks have been rolled forward. */
  rolledThrough: string;
  reviews: Record<string, ReviewRecord>;
  /** User weeks and phases layered over the base 13-week plan. */
  plan: UserPlan;
  settings: { version: 2 };
}

export type Action =
  | { type: 'toggleBlock'; date: string; id: string }
  | { type: 'toggleSunday'; date: string; id: string }
  | { type: 'toggleCustom'; date: string; id: string }
  | { type: 'setCounter'; date: string; field: CounterField; value: number }
  | { type: 'resetHours'; date: string }
  | { type: 'setText'; date: string; field: 'morning' | 'night'; value: string }
  | { type: 'addTag'; date: string; tag: string; topicId?: string }
  | { type: 'removeTag'; date: string; index: number }
  | { type: 'toggleTopic'; topicId: string; date: string }
  | { type: 'setOverride'; dates: string[]; id: string; override: Override }
  | { type: 'clearOverride'; date: string; id: string }
  | { type: 'skipTask'; date: string; id: string; reason: string }
  | { type: 'unskipTask'; date: string; id: string }
  | { type: 'moveOut'; date: string; id: string; item: CarriedItem }
  | { type: 'undoMoveOut'; date: string; id: string }
  | { type: 'addCustom'; date: string; task: CustomTask }
  | { type: 'updateCustom'; date: string; id: string; patch: Partial<CustomTask> }
  | { type: 'deleteCustom'; date: string; id: string }
  | { type: 'toggleCarried'; id: string; date: string }
  | { type: 'updateCarried'; id: string; patch: Partial<Pick<CarriedItem, 'text' | 'subject'>> }
  | { type: 'moveCarried'; id: string; date: string }
  | { type: 'dropCarried'; id: string }
  | { type: 'restoreCarried'; item: CarriedItem; index: number }
  | { type: 'rollover'; today: string }
  | { type: 'freeze'; date: string }
  | { type: 'upsertPlanWeek'; week: UserWeek }
  | { type: 'deletePlanWeek'; weekNumber: number }
  | { type: 'upsertPlanPhase'; phase: UserPhase }
  | { type: 'deletePlanPhase'; id: string }
  | { type: 'updateReview'; week: number; patch: Partial<ReviewRecord> }
  | { type: 'import'; state: unknown; today: string }
  | { type: 'reset'; today: string }
  /** Internal: swap in a state already persisted by the storage layer (remote merge). */
  | { type: 'replace'; state: TrackerState };
