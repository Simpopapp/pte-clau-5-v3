import { useSyncExternalStore } from "react";

import { TYPE_META, allMeta, type QuestionMeta, type TaskType } from "@/lib/pte";
import {
  addSessionRecord,
  clearSessionDraft,
  getSessionDraft,
  saveSessionDraft,
  type SessionKind,
  type SessionResult,
} from "@/lib/storage";
import type { QuestionStat } from "@/lib/storage";

export type { SessionResult } from "@/lib/storage";

export interface SessionState {
  active: boolean;
  size: number;
  queue: string[];
  index: number; // próxima questão a responder
  startedAt: number;
  results: SessionResult[];
  /** Contexto da sessão (histórico). */
  kind: SessionKind;
  label: string;
  /** true quando a sessão já foi arquivada no histórico (evita duplicar no endSession). */
  archived: boolean;
}

const IDLE: SessionState = {
  active: false,
  size: 0,
  queue: [],
  index: 0,
  startedAt: 0,
  results: [],
  kind: "srs",
  label: "Sessão",
  archived: false,
};

let state: SessionState = IDLE;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Questões de task types que já têm motor de prática. */
const readyMeta: QuestionMeta[] = allMeta.filter((m) => TYPE_META[m.taskType].ready);

/** Score abaixo do qual a última tentativa conta como "erro" (modo Revisar erros). */
export const ERROR_SCORE = 70;

type Rand = () => number;

function shuffle<T>(list: T[], rand: Rand): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Round-robin por task type, preservando a ordem interna de cada tipo (evita fila de um tipo só). */
export function interleaveByType<T extends { taskType: TaskType }>(list: T[]): T[] {
  const buckets = new Map<TaskType, T[]>();
  for (const item of list) {
    const b = buckets.get(item.taskType) ?? [];
    b.push(item);
    buckets.set(item.taskType, b);
  }
  const lanes = [...buckets.values()];
  const out: T[] = [];
  for (let i = 0; lanes.some((l) => i < l.length); i++) {
    for (const l of lanes) if (i < l.length) out.push(l[i]!);
  }
  return out;
}

export interface QueueOptions {
  /** "smart" (padrão): revisões vencidas + novas; "errors": só o que errou na última vez;
   *  "due": exclusivamente revisões vencidas (fila do dia), pior último score primeiro. */
  mode?: "smart" | "errors" | "due";
  /** Restringe a fila a estes task types. */
  taskTypes?: TaskType[];
  now?: number;
  rand?: Rand;
}

function poolFor(taskTypes?: TaskType[]): QuestionMeta[] {
  return taskTypes?.length ? readyMeta.filter((m) => taskTypes.includes(m.taskType)) : readyMeta;
}

/** Quantas questões estão vencidas para revisão (já tentadas e com `dueAt` no passado). */
export function countDue(stats: Map<string, QuestionStat>, now = Date.now()): number {
  let n = 0;
  for (const m of readyMeta) {
    const s = stats.get(m.id);
    if (s && s.dueAt <= now) n++;
  }
  return n;
}

/** Vencidas por task type (para badges por seção/tipo). */
export function countDueByType(
  stats: Map<string, QuestionStat>,
  now = Date.now(),
): Map<TaskType, number> {
  const out = new Map<TaskType, number>();
  for (const m of readyMeta) {
    const s = stats.get(m.id);
    if (!s || s.dueAt > now) continue;
    out.set(m.taskType, (out.get(m.taskType) ?? 0) + 1);
  }
  return out;
}

/** Quantas questões têm a última tentativa abaixo de ERROR_SCORE. */
export function countErrors(stats: Map<string, QuestionStat>): number {
  let n = 0;
  for (const m of readyMeta) {
    const s = stats.get(m.id);
    if (s && (s.lastScore ?? 100) < ERROR_SCORE) n++;
  }
  return n;
}

/**
 * Fila inteligente (repetição espaçada):
 *  1. revisões vencidas (as de pior último score primeiro),
 *  2. questões novas (embaralhadas, intercaladas por tipo),
 *  3. o restante, da revisão mais próxima para a mais distante.
 * Revisões e novas entram na proporção 2:1; sempre intercalando task types.
 */
export function buildQueue(
  stats: Map<string, QuestionStat>,
  size: number,
  opts: QueueOptions = {},
): string[] {
  const now = opts.now ?? Date.now();
  const rand = opts.rand ?? Math.random;
  const pool = poolFor(opts.taskTypes);

  if (opts.mode === "errors") {
    const errs = pool
      .filter((m) => (stats.get(m.id)?.lastScore ?? 100) < ERROR_SCORE)
      .sort((a, b) => (stats.get(a.id)?.lastScore ?? 0) - (stats.get(b.id)?.lastScore ?? 0));
    return interleaveByType(errs)
      .slice(0, size)
      .map((m) => m.id);
  }

  if (opts.mode === "due") {
    const dueOnly = pool
      .filter((m) => {
        const s = stats.get(m.id);
        return !!s && s.dueAt <= now;
      })
      .sort((a, b) => {
        const sa = stats.get(a.id)!;
        const sb = stats.get(b.id)!;
        return (sa.lastScore ?? 0) - (sb.lastScore ?? 0) || sa.dueAt - sb.dueAt;
      });
    return interleaveByType(dueOnly)
      .slice(0, size)
      .map((m) => m.id);
  }

  const due: QuestionMeta[] = [];
  const fresh: QuestionMeta[] = [];
  const later: QuestionMeta[] = [];
  for (const m of pool) {
    const s = stats.get(m.id);
    if (!s) fresh.push(m);
    else if (s.dueAt <= now) due.push(m);
    else later.push(m);
  }
  due.sort((a, b) => {
    const sa = stats.get(a.id)!;
    const sb = stats.get(b.id)!;
    return (sa.lastScore ?? 0) - (sb.lastScore ?? 0) || sa.dueAt - sb.dueAt;
  });
  later.sort((a, b) => stats.get(a.id)!.dueAt - stats.get(b.id)!.dueAt);

  const dueQ = interleaveByType(due);
  const freshQ = interleaveByType(shuffle(fresh, rand));
  const laterQ = interleaveByType(later);

  const out: string[] = [];
  let di = 0;
  let fi = 0;
  while (out.length < size && (di < dueQ.length || fi < freshQ.length)) {
    for (let k = 0; k < 2 && di < dueQ.length && out.length < size; k++) out.push(dueQ[di++]!.id);
    if (fi < freshQ.length && out.length < size) out.push(freshQ[fi++]!.id);
    // sem novas: segue só com revisões (e vice-versa) sem travar o loop
    if (fi >= freshQ.length && di < dueQ.length && out.length < size) out.push(dueQ[di++]!.id);
  }
  for (let li = 0; out.length < size && li < laterQ.length; li++) out.push(laterQ[li]!.id);
  return out;
}

export type MixCounts = Partial<Record<TaskType, number>>;

function scoreKey(q: QuestionMeta, stats: Map<string, QuestionStat>): [number, number] {
  const s = stats.get(q.id);
  return [s?.bestContent ?? -1, s?.lastAttemptAt ?? 0];
}

/**
 * Fila mista: para cada tipo escolhe as questões mais fracas/menos recentes;
 * os tipos com pior média vêm primeiro e são intercalados (round-robin).
 */
export function buildMixedQueue(
  stats: Map<string, QuestionStat>,
  counts: MixCounts,
  pool: QuestionMeta[] = readyMeta,
  rand: Rand = Math.random,
): string[] {
  const picks: { type: TaskType; avg: number; ids: string[] }[] = [];
  for (const [type, n] of Object.entries(counts) as [TaskType, number][]) {
    if (!n || n <= 0) continue;
    const list = pool
      .filter((q) => q.taskType === type)
      .map((q) => ({ q, k: scoreKey(q, stats), r: rand() }))
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.r - b.r);
    if (!list.length) continue;
    const scored = list.filter((x) => x.k[0] >= 0);
    const avg = scored.length ? scored.reduce((s, x) => s + x.k[0], 0) / scored.length : -1; // nunca treinado = mais fraco
    picks.push({ type, avg, ids: list.slice(0, n).map((x) => x.q.id) });
  }
  picks.sort((a, b) => a.avg - b.avg);
  const out: string[] = [];
  for (let i = 0; picks.some((p) => i < p.ids.length); i++) {
    for (const p of picks) if (i < p.ids.length) out.push(p.ids[i]!);
  }
  return out;
}

function begin(queue: string[], kind: SessionKind = "srs", label = "Sessão") {
  state = {
    active: true,
    size: queue.length,
    queue,
    index: 0,
    startedAt: Date.now(),
    results: [],
    kind,
    label,
    archived: false,
  };
  saveSessionDraft(toDraft(state));
  emit();
}

/** Extrai o draft persistível do estado em memória. */
function toDraft(s: SessionState) {
  return {
    kind: s.kind,
    label: s.label,
    queue: s.queue,
    index: s.index,
    startedAt: s.startedAt,
    results: s.results,
  };
}

/** Arquiva a sessão no histórico (uma única vez). */
function archive(s: SessionState) {
  if (s.archived || s.results.length === 0) return;
  addSessionRecord({
    startedAt: s.startedAt,
    finishedAt: Date.now(),
    kind: s.kind,
    label: s.label,
    results: s.results,
  });
  state = { ...state, archived: true };
}

export function startSession(size: number, stats: Map<string, QuestionStat>, opts?: QueueOptions) {
  const kind: SessionKind = opts?.mode === "errors" ? "errors" : "srs";
  const label = opts?.mode === "errors" ? `Revisar erros (${size})` : `Sessão de ${size}`;
  begin(buildQueue(stats, size, opts), kind, label);
}

export function startMixedSession(counts: MixCounts, stats: Map<string, QuestionStat>) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  begin(buildMixedQueue(stats, counts), "mixed", `Mista de ${total}`);
}

/** Fila do dia: só revisões vencidas, pior último score primeiro. */
export function startDueSession(size: number, stats: Map<string, QuestionStat>) {
  begin(buildQueue(stats, size, { mode: "due" }), "due", `Fila do dia (${size})`);
}

export function isSessionItem(qid: string): boolean {
  return state.active && state.queue.includes(qid);
}

/** Próxima questão da sessão (undefined se encerrada ou concluída). */
export function sessionNextId(): string | undefined {
  if (!state.active) return undefined;
  return state.queue[state.index];
}

/** Registra o resultado da questão atual e avança a fila. */
export function completeSessionItem(result: SessionResult) {
  if (!state.active) return;
  state = { ...state, index: state.index + 1, results: [...state.results, result] };
  if (sessionFinished()) {
    archive(state);
    clearSessionDraft();
  } else {
    saveSessionDraft(toDraft(state));
  }
  emit();
}

export function sessionFinished(): boolean {
  return state.active && state.index >= state.queue.length;
}

export function endSession() {
  if (state.active) {
    archive(state);
    clearSessionDraft();
  }
  state = IDLE;
  emit();
}

// Retomada: se havia um draft de sessão, restaura o estado em memória.
{
  const draft = getSessionDraft();
  if (draft) {
    state = {
      active: true,
      size: draft.queue.length,
      queue: draft.queue,
      index: draft.index,
      startedAt: draft.startedAt,
      results: draft.results,
      kind: draft.kind,
      label: draft.label,
      archived: draft.index >= draft.queue.length,
    };
  }
}

const getSnapshot = () => state;

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}
