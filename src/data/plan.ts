import { addDays } from 'date-fns';

/** Week 1 starts here; week n starts on PLAN_START + 7·(n−1). The plan has no end date. */
export const PLAN_START = new Date(2026, 9, 2); // Fri 2 Oct 2026
/** Number of weeks in the built-in base plan (2 Oct – 31 Dec 2026). User weeks extend it. */
export const BASE_WEEKS = 13;

export type SubjectId = 'dsa' | 'java' | 'cs' | 'ai' | 'apt';

export interface Subject {
  id: SubjectId;
  name: string;
  short: string;
  color: string;
}

export const SUBJECTS: Subject[] = [
  { id: 'dsa', name: 'DSA', short: 'DSA', color: '#E8B86D' },
  { id: 'java', name: 'Java + Spring Boot', short: 'Java', color: '#8FB996' },
  { id: 'cs', name: 'CS Fundamentals', short: 'CS', color: '#7FA7C9' },
  { id: 'ai', name: 'AI', short: 'AI', color: '#B79CD9' },
  { id: 'apt', name: 'Aptitude + Applications', short: 'Aptitude', color: '#D98C8C' },
];

export const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s])) as Record<SubjectId, Subject>;

export interface BasePhase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number | null;
}

export const BASE_PHASES: BasePhase[] = [
  { id: 'base-1', name: 'Foundations', startWeek: 1, endWeek: 4 },
  { id: 'base-2', name: 'Depth and projects', startWeek: 5, endWeek: 9 },
  { id: 'base-3', name: 'Interview mode', startWeek: 10, endWeek: 13 },
];

/** Phase for weeks no other phase covers (after the base plan, until you create another). */
export const DEFAULT_PHASE: BasePhase = { id: 'keep-going', name: 'Keep going', startWeek: BASE_WEEKS + 1, endWeek: null };

export interface Topic {
  id: string;
  week: number;
  subject: SubjectId;
  title: string;
}

export interface Week {
  n: number;
  start: Date;
  end: Date;
  topics: Record<SubjectId, Topic>;
}

const RAW_WEEKS: Record<SubjectId, string>[] = [
  {
    dsa: 'Arrays, two pointers',
    java: 'Core Java: OOP, interfaces, exceptions',
    cs: 'OOP pillars, SOLID',
    ai: 'How LLMs work: tokens, embeddings, context window',
    apt: 'Percentages, profit & loss',
  },
  {
    dsa: 'Sliding window, hashing',
    java: 'Collections, generics, streams, Java 21 features',
    cs: 'DBMS: ER model, keys, normalization',
    ai: 'Prompting, calling an LLM API, structured JSON output',
    apt: 'Ratio, averages, mixtures',
  },
  {
    dsa: 'Binary search (arrays + on answer)',
    java: 'Spring core: IoC, DI, beans, scopes, lifecycle',
    cs: 'DBMS: SQL, joins, subqueries',
    ai: 'Build a small app that calls an LLM API',
    apt: 'Time & work, pipes',
  },
  {
    dsa: 'Strings, sorting, prefix sums',
    java: 'Spring Boot REST: controllers, DTOs, validation, exception handling',
    cs: 'DBMS: transactions, ACID, indexing, isolation',
    ai: 'Function/tool calling basics',
    apt: 'Speed, distance, time',
  },
  {
    dsa: 'Linked lists',
    java: 'Spring Data JPA, Hibernate, PostgreSQL',
    cs: 'OS: processes, threads, scheduling',
    ai: 'RAG concepts: chunking, embeddings, vector search',
    apt: 'Number system, HCF/LCM',
  },
  {
    dsa: 'Stacks, queues, monotonic stack',
    java: 'Entity relations, pagination, queries',
    cs: 'OS: synchronization, deadlock',
    ai: 'Build RAG with pgvector + Spring AI or LangChain',
    apt: 'Permutation, combination, probability',
  },
  {
    dsa: 'Recursion, backtracking',
    java: 'Spring Security + JWT',
    cs: 'OS: memory, paging, virtual memory',
    ai: 'Finish RAG app + simple evaluation',
    apt: 'Series, coding-decoding',
  },
  {
    dsa: 'Binary trees',
    java: 'JUnit 5, Mockito',
    cs: 'CN: OSI vs TCP/IP, TCP vs UDP',
    ai: 'MCP: hosts, clients, servers, tools',
    apt: 'Blood relations, directions, seating',
  },
  {
    dsa: 'BST, heaps',
    java: 'Docker, deploy BlockEvidence',
    cs: 'CN: HTTP/HTTPS, DNS, typing a URL',
    ai: 'Build an MCP server',
    apt: 'Reading comprehension, grammar',
  },
  {
    dsa: 'Graphs: BFS, DFS, topo sort',
    java: 'LLD: design patterns',
    cs: 'DBMS revision + 50 SQL problems',
    ai: 'Agents: tool use, multi-step workflows',
    apt: 'Full mock + review',
  },
  {
    dsa: 'Graphs: Dijkstra, DSU, MST',
    java: 'HLD basics: caching, load balancing, scaling (DDIA ch. 1, 3, 5–7)',
    cs: 'OS revision + interview questions',
    ai: 'Polish RAG and MCP repos',
    apt: 'Full mock + review',
  },
  {
    dsa: 'DP: 1D, 2D, subsequences',
    java: '2 LLD problems (parking lot, URL shortener)',
    cs: 'CN revision + interview questions',
    ai: 'Add AI projects to resume',
    apt: 'Full mock + review',
  },
  {
    dsa: 'DP: LIS, partitions + LeetCode 150 gaps',
    java: 'Mock project walkthroughs (BlockEvidence, MedCare)',
    cs: 'Mixed rapid-fire Q&A, out loud',
    ai: 'Explain RAG/MCP in 2 minutes',
    apt: 'Full mock + review',
  },
];

export const WEEKS: Week[] = RAW_WEEKS.map((raw, i) => {
  const n = i + 1;
  const start = addDays(PLAN_START, 7 * i);
  const topics = Object.fromEntries(
    SUBJECTS.map((s) => [s.id, { id: `w${n}-${s.id}`, week: n, subject: s.id, title: raw[s.id] }]),
  ) as Record<SubjectId, Topic>;
  return { n, start, end: addDays(start, 6), topics };
});

/** Topic ids are stable per (week, subject), for base and user weeks alike. */
export const topicId = (week: number, subject: SubjectId) => `w${week}-${subject}`;

/** Topic text per subject; null = not set. */
export type TopicTexts = Record<SubjectId, string | null>;

const PLACEHOLDER_NAME: Record<SubjectId, string> = { dsa: 'DSA', java: 'Java', cs: 'CS', ai: 'AI', apt: 'aptitude' };
export const placeholderTask = (s: SubjectId) => `Set this week's ${PLACEHOLDER_NAME[s]} topic`;

/* ---------- Timetable ---------- */

export type BlockId = 'plan' | 'apt' | 'apps' | 'cs' | 'java' | 'ai' | 'dsa1' | 'dsa2' | 'recall';

export interface TimeBlock {
  kind: 'block';
  id: BlockId;
  start: string; // HH:mm
  end: string;
  name: string;
  subject: SubjectId | null;
  /** Today's task text from this week's topics (placeholder when the topic isn't set). */
  task: (t: TopicTexts) => string;
  /** Subject blocks are carried forward when missed; plan/recall are not. */
  carry: boolean;
}

export interface BreakRow {
  kind: 'break';
  id: string;
  start: string;
  end: string;
}

export type TimetableRow = TimeBlock | BreakRow;

export const TIMETABLE: TimetableRow[] = [
  { kind: 'block', id: 'plan', start: '08:45', end: '09:00', name: 'Plan', subject: null, carry: false, task: () => "Send today's targets to Claude" },
  { kind: 'block', id: 'apt', start: '09:00', end: '09:45', name: 'Aptitude', subject: 'apt', carry: true, task: (t) => (t.apt ? `${t.apt}: learn, then 20 timed questions` : placeholderTask('apt')) },
  { kind: 'block', id: 'apps', start: '09:45', end: '10:00', name: 'Applications', subject: 'apt', carry: true, task: () => 'Check job tracker, alerts, apply' },
  { kind: 'block', id: 'cs', start: '10:00', end: '11:30', name: 'CS fundamentals', subject: 'cs', carry: true, task: (t) => (t.cs ? `${t.cs}: watch, then 1-page keyword skeleton` : placeholderTask('cs')) },
  { kind: 'break', id: 'b1', start: '11:30', end: '11:45' },
  { kind: 'block', id: 'java', start: '11:45', end: '14:15', name: 'Java + Spring Boot', subject: 'java', carry: true, task: (t) => (t.java ? `${t.java}: video section, then build into BlockEvidence` : placeholderTask('java')) },
  { kind: 'break', id: 'b2', start: '14:15', end: '15:30' },
  { kind: 'block', id: 'ai', start: '15:30', end: '17:00', name: 'AI', subject: 'ai', carry: true, task: (t) => (t.ai ? `${t.ai}: concept + hands-on build` : placeholderTask('ai')) },
  { kind: 'break', id: 'b3', start: '17:00', end: '17:30' },
  { kind: 'block', id: 'dsa1', start: '17:30', end: '19:30', name: 'DSA block 1', subject: 'dsa', carry: true, task: (t) => (t.dsa ? `${t.dsa}: learn + solve 2–3 problems` : placeholderTask('dsa')) },
  { kind: 'break', id: 'b4', start: '19:30', end: '20:15' },
  { kind: 'block', id: 'dsa2', start: '20:15', end: '21:45', name: 'DSA block 2', subject: 'dsa', carry: true, task: () => '2 more problems unaided + 1 revision problem' },
  { kind: 'block', id: 'recall', start: '21:45', end: '22:00', name: 'Recall', subject: null, carry: false, task: () => "Explain today's topics out loud, then night check-in" },
];

export const BLOCKS: TimeBlock[] = TIMETABLE.filter((r): r is TimeBlock => r.kind === 'block');
export const BLOCK_BY_ID = Object.fromEntries(BLOCKS.map((b) => [b.id, b])) as Record<BlockId, TimeBlock>;
export const DSA_BLOCKS: BlockId[] = ['dsa1', 'dsa2'];

export interface SundayTask {
  id: string;
  name: string;
}

export const SUNDAY_TASKS: SundayTask[] = [
  { id: 'contest', name: 'LeetCode weekly contest (8:00 AM IST)' },
  { id: 'redo', name: 'Redo every problem failed this week' },
  { id: 'mock', name: '1 full aptitude mock' },
  { id: 'cs-revise', name: "Revise the week's CS skeletons out loud" },
  { id: 'review', name: 'Weekly review with Claude' },
];

/* ---------- Rules & targets ---------- */

export const STREAK_THRESHOLD = 0.7;
export const SUNDAY_MIN_TASKS = 3;

export type CounterField = 'dsa' | 'apps' | 'hours';

export const DAILY_COUNTERS: { field: CounterField; label: string; target: string; max: number; step: number }[] = [
  { field: 'dsa', label: 'DSA problems solved', target: 'Target 4–5/day', max: 50, step: 1 },
  { field: 'apps', label: 'Applications sent', target: 'Target 2/day', max: 50, step: 1 },
  { field: 'hours', label: 'Hours studied', target: '0–12 hrs', max: 12, step: 0.5 },
];

export const HOURS_TARGET = 10;

/** DSA problem goals for the base phases. User phases can set their own (UserPhase.dsaGoal). */
export const DSA_GOALS = [
  { by: new Date(2026, 9, 29), label: '29 Oct', count: 110 },
  { by: new Date(2026, 11, 3), label: '3 Dec', count: 250 },
  { by: new Date(2026, 11, 31), label: '31 Dec', count: 350 },
];

export const WEEKLY_TARGETS: { subject: SubjectId; target: string }[] = [
  { subject: 'dsa', target: '25–30 problems' },
  { subject: 'java', target: '1 feature shipped in BlockEvidence' },
  { subject: 'cs', target: '1 sub-topic + 1-page notes' },
  { subject: 'ai', target: '1 working mini-build' },
  { subject: 'apt', target: '1 topic + 10–15 applications' },
];

export const WEEKLY_DSA_MIN = 25;
export const WEEKLY_APPS_MIN = 10;
