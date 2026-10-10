import { useSyncExternalStore } from "react";

import type { TaskType } from "@/lib/pte/types";

export type Accent = "en-AU" | "en-US" | "en-GB";

export interface Attempt {
  qid: string;
  ts: number;
  taskType: TaskType;
  mode: "speech" | "manual";
  /** Legado Read Aloud — manter para compatibilidade. */
  contentScore: number | null;
  /** Score geral 0-100 de qualquer motor (fallback: contentScore). */
  score: number | null;
  wpm: number | null;
  durationMs: number;
  /** Métricas específicas por tipo (ex.: wpm, lacunas acertadas, saldo líquido). */
  metrics?: Record<string, number>;
  /** Rótulos de erro específicos (palavras erradas `missed:*`, trap, categoria). */
  tags?: string[];
}

export interface Settings {
  prepSeconds: number; // 0 = sem contagem
  dailyGoal: number;
  modelRate: number;
  accent: Accent;
  /** Data da prova ("YYYY-MM-DD") ou null = sem meta declarada. */
  examDate: string | null;
  /** Pontuação-alvo PTE (10–90). */
  targetScore: number;
}

export interface SessionResult {
  qid: string;
  score: number | null;
  wpm: number | null;
}

/** Tipos de sessão registráveis no histórico. */
export type SessionKind = "srs" | "mixed" | "errors" | "due" | "exam";

/** Sessão concluída (ou encerrada com resultados), arquivada no histórico. */
export interface SessionRecord {
  id: string;
  startedAt: number;
  finishedAt: number;
  kind: SessionKind;
  label: string;
  results: SessionResult[];
}

/** Sessão em andamento — persistida para permitir retomada após reload. */
export interface SessionDraft {
  kind: SessionKind;
  label: string;
  queue: string[];
  index: number;
  startedAt: number;
  results: SessionResult[];
}

/** Nota de texto livre por questão (chave do mapa = qid). */
export interface QuestionNote {
  text: string;
  updatedAt: number;
}

export interface AppState {
  version: 4;
  attempts: Attempt[];
  bookmarks: string[];
  notes: Record<string, QuestionNote>;
  sessions: SessionRecord[];
  draft: SessionDraft | null;
  settings: Settings;
}

export interface QuestionStat {
  attempts: number;
  bestContent: number | null;
  bestWpm: number | null;
  lastAttemptAt: number;
  /** Score da tentativa mais recente. */
  lastScore: number | null;
  /** Quantas tentativas atingiram o score de "forte" (>= STRONG_SCORE). */
  strongAttempts: number;
  /** Caixa de repetição espaçada (Leitner, 0–5). */
  box: number;
  /** Quando a questão volta a "vencer" para revisão (ms). */
  dueAt: number;
}

/** Score a partir do qual uma tentativa conta como acerto na repetição espaçada. */
export const PASS_SCORE = 80;
/** Score de uma tentativa "forte" (base do critério de dominada). */
export const STRONG_SCORE = 90;
/** Intervalo (dias) até a próxima revisão, por caixa Leitner. */
export const SRS_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;

export interface TypeStat {
  attempts: number;
  attemptedIds: number;
  bestScore: number | null;
  lastAttemptAt: number;
}

const KEY = "pte-master-hub";
/** Chaves antigas, lidas uma vez e migradas para KEY. */
const LEGACY_KEYS = ["readaloud-trainer-v1"];
/** Teto de tentativas guardadas (as mais antigas saem primeiro) para o localStorage não crescer sem limite. */
export const MAX_ATTEMPTS = 5000;
/** Teto de sessões arquivadas no histórico (as mais antigas saem primeiro). */
export const MAX_SESSIONS = 100;

export const DEFAULT_SETTINGS: Settings = {
  prepSeconds: 40,
  dailyGoal: 10,
  modelRate: 1,
  accent: "en-AU",
  examDate: null,
  targetScore: 65,
};

export const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: "en-AU", label: "Australiano (padrão PTE)" },
  { value: "en-US", label: "Americano" },
  { value: "en-GB", label: "Britânico" },
];

export function emptyState(preserveSettings?: Settings): AppState {
  return {
    version: 4,
    attempts: [],
    bookmarks: [],
    notes: {},
    sessions: [],
    draft: null,
    settings: preserveSettings ? { ...preserveSettings } : { ...DEFAULT_SETTINGS },
  };
}

const EMPTY = emptyState();

/** Aceita "YYYY-MM-DD" que de fato existe no calendário (1970–2100). */
export function isValidExamDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function normalizeSettings(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Settings>;
  const accent: Accent =
    s.accent === "en-US" || s.accent === "en-GB" || s.accent === "en-AU"
      ? s.accent
      : DEFAULT_SETTINGS.accent;
  const targetScore =
    typeof s.targetScore === "number" &&
    Number.isFinite(s.targetScore) &&
    s.targetScore >= 10 &&
    s.targetScore <= 90
      ? Math.round(s.targetScore)
      : DEFAULT_SETTINGS.targetScore;
  return {
    prepSeconds:
      typeof s.prepSeconds === "number" && s.prepSeconds >= 0
        ? s.prepSeconds
        : DEFAULT_SETTINGS.prepSeconds,
    dailyGoal:
      typeof s.dailyGoal === "number" && s.dailyGoal > 0 ? s.dailyGoal : DEFAULT_SETTINGS.dailyGoal,
    modelRate:
      typeof s.modelRate === "number" && s.modelRate > 0 ? s.modelRate : DEFAULT_SETTINGS.modelRate,
    accent,
    examDate: isValidExamDate(s.examDate) ? s.examDate : null,
    targetScore,
  };
}

function normalizeAttempt(raw: unknown): Attempt | null {
  const a = (raw ?? {}) as Partial<Attempt> & { qid?: unknown };
  if (typeof a.qid !== "string" || a.qid.length === 0) return null;
  const contentScore = typeof a.contentScore === "number" ? a.contentScore : null;
  const score = typeof a.score === "number" ? a.score : contentScore;
  return {
    qid: a.qid,
    ts: typeof a.ts === "number" ? a.ts : Date.now(),
    taskType: (a.taskType ?? "read_aloud") as TaskType,
    mode: a.mode === "manual" ? "manual" : "speech",
    contentScore,
    score,
    wpm: typeof a.wpm === "number" ? a.wpm : null,
    durationMs: typeof a.durationMs === "number" ? a.durationMs : 0,
    ...(a.metrics && typeof a.metrics === "object"
      ? { metrics: a.metrics as Record<string, number> }
      : {}),
    ...(Array.isArray(a.tags)
      ? { tags: a.tags.filter((t) => typeof t === "string" && t.length > 0).slice(0, 12) }
      : {}),
  };
}

// ---------- normalizadores v3 (sessões, draft, notas) ----------

const SESSION_KINDS: SessionKind[] = ["srs", "mixed", "errors", "due", "exam"];

function kindOf(raw: unknown): SessionKind {
  return SESSION_KINDS.includes(raw as SessionKind) ? (raw as SessionKind) : "srs";
}

function normalizeResults(raw: unknown): SessionResult[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const x = (r ?? {}) as Partial<SessionResult>;
      if (typeof x.qid !== "string" || x.qid.length === 0) return null;
      return {
        qid: x.qid,
        score: typeof x.score === "number" ? x.score : null,
        wpm: typeof x.wpm === "number" ? x.wpm : null,
      } satisfies SessionResult;
    })
    .filter((r): r is SessionResult => r !== null);
}

function normalizeSessions(raw: unknown): SessionRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): SessionRecord | null => {
      const x = (r ?? {}) as Partial<SessionRecord>;
      if (typeof x.id !== "string" || x.id.length === 0) return null;
      const startedAt = typeof x.startedAt === "number" ? x.startedAt : 0;
      const finishedAt = typeof x.finishedAt === "number" ? x.finishedAt : startedAt;
      const results = normalizeResults(x.results);
      if (results.length === 0) return null; // sessão sem resultado não vale histórico
      return {
        id: x.id,
        startedAt,
        finishedAt,
        kind: kindOf(x.kind),
        label: typeof x.label === "string" ? x.label : "Sessão",
        results,
      };
    })
    .filter((r): r is SessionRecord => r !== null)
    .sort((a, b) => b.finishedAt - a.finishedAt)
    .slice(0, MAX_SESSIONS);
}

function normalizeDraft(raw: unknown): SessionDraft | null {
  const d = (raw ?? {}) as Partial<SessionDraft>;
  if (!Array.isArray(d.queue) || d.queue.length === 0) return null;
  const queue = d.queue.filter((q): q is string => typeof q === "string" && q.length > 0);
  if (queue.length === 0) return null;
  const index =
    typeof d.index === "number" && d.index >= 0 && d.index <= queue.length
      ? Math.floor(d.index)
      : 0;
  return {
    kind: kindOf(d.kind),
    label: typeof d.label === "string" && d.label ? d.label : "Sessão",
    queue,
    index,
    startedAt: typeof d.startedAt === "number" ? d.startedAt : Date.now(),
    results: normalizeResults(d.results),
  };
}

function normalizeNotes(raw: unknown): Record<string, QuestionNote> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, QuestionNote> = {};
  for (const [qid, note] of Object.entries(raw as Record<string, unknown>)) {
    const n = (note ?? {}) as Partial<QuestionNote>;
    if (typeof n.text !== "string" || !n.text.trim()) continue;
    out[qid] = {
      text: n.text.slice(0, 2000),
      updatedAt: typeof n.updatedAt === "number" ? n.updatedAt : 0,
    };
  }
  return out;
}

/**
 * Migração pura (testável): aceita estado v1 (Read Aloud), v2, v3 ou v4 e devolve AppState v4.
 * Estados ilegíveis voltam limpos preservando nada.
 */
export function migrateLegacyState(parsed: unknown): AppState {
  const obj = (parsed ?? {}) as Record<string, unknown> & { version?: number };
  if (obj.version !== 1 && obj.version !== 2 && obj.version !== 3 && obj.version !== 4)
    return emptyState();
  const settings = normalizeSettings(obj["settings"]);
  const attempts = (Array.isArray(obj["attempts"]) ? obj["attempts"] : [])
    .map((a) => normalizeAttempt(a))
    .filter((a): a is Attempt => a !== null);
  const bookmarks = (Array.isArray(obj["bookmarks"]) ? obj["bookmarks"] : []).filter(
    (b) => typeof b === "string",
  );
  const notes = normalizeNotes(obj["notes"]);
  const sessions = normalizeSessions(obj["sessions"]);
  const draft = obj.version === 3 || obj.version === 4 ? normalizeDraft(obj["draft"]) : null;
  return { version: 4, attempts, bookmarks, notes, sessions, draft, settings };
}

function readKey(key: string): AppState | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  return migrateLegacyState(JSON.parse(raw) as unknown);
}

function load(): AppState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const current = readKey(KEY);
    if (current) return current;
    for (const legacy of LEGACY_KEYS) {
      const old = readKey(legacy);
      if (old) {
        // migra para a chave nova e só então apaga a antiga
        window.localStorage.setItem(KEY, JSON.stringify(old));
        window.localStorage.removeItem(legacy);
        return old;
      }
    }
    return emptyState();
  } catch (err) {
    console.warn("Progresso ilegível — iniciando com estado limpo.", err);
    return emptyState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();

// ---------- saúde da persistência (quota cheia / modo privado) ----------
let persistFailed = false;
const persistListeners = new Set<() => void>();

function setPersistFailed(v: boolean) {
  if (persistFailed === v) return;
  persistFailed = v;
  persistListeners.forEach((l) => l());
}

/** true quando o último salvamento falhou (progresso só em memória até recarregar). */
export function usePersistFailed(): boolean {
  return useSyncExternalStore(
    (l) => {
      persistListeners.add(l);
      return () => persistListeners.delete(l);
    },
    () => persistFailed,
    () => false,
  );
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    setPersistFailed(false);
  } catch {
    setPersistFailed(true);
  }
}

// Sincroniza entre abas: outra aba gravou → relê o estado.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      state = e.newValue ? migrateLegacyState(JSON.parse(e.newValue) as unknown) : emptyState();
      listeners.forEach((l) => l());
    } catch {
      /* conteúdo ilegível vindo de outra aba: ignora */
    }
  });
}

function setState(next: AppState) {
  state = next;
  if (typeof window !== "undefined") persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function recordAttempt(
  attempt: Omit<Partial<Attempt>, "ts"> & { qid: string; ts?: number },
) {
  const { metrics, tags, ...rest } = attempt;
  const entry: Attempt = {
    ts: attempt.ts ?? Date.now(),
    ...rest,
    ...(metrics ? { metrics } : {}),
    ...(tags && tags.length > 0 ? { tags: tags.slice(0, 12) } : {}),
    taskType: attempt.taskType ?? "read_aloud",
    mode: attempt.mode ?? "manual",
    contentScore: attempt.contentScore ?? null,
    score: attempt.score ?? attempt.contentScore ?? null,
    wpm: attempt.wpm ?? null,
    durationMs: attempt.durationMs ?? 0,
  };
  setState({ ...state, attempts: [...state.attempts, entry].slice(-MAX_ATTEMPTS) });
}

export function toggleBookmark(qid: string) {
  const has = state.bookmarks.includes(qid);
  setState({
    ...state,
    bookmarks: has ? state.bookmarks.filter((id) => id !== qid) : [...state.bookmarks, qid],
  });
}

export function updateSettings(patch: Partial<Settings>) {
  setState({ ...state, settings: { ...state.settings, ...patch } });
}

// ---------- sessões: histórico, draft retomável e notas ----------

/** Sessão em andamento (draft) do estado atual — leitura pura, sem hook. */
export function getSessionDraft(): SessionDraft | null {
  return state.draft;
}

/** Grava/atualiza o draft da sessão em andamento (retomável após reload). */
export function saveSessionDraft(draft: SessionDraft) {
  setState({ ...state, draft: normalizeDraft(draft) });
}

/** Limpa o draft (sessão encerrada ou descartada). */
export function clearSessionDraft() {
  if (state.draft === null) return;
  setState({ ...state, draft: null });
}

/** Arquiva uma sessão no histórico (mais recente primeiro, teto MAX_SESSIONS). */
export function addSessionRecord(record: Omit<SessionRecord, "id"> & { id?: string }) {
  const entry: SessionRecord = {
    id: record.id ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    kind: kindOf(record.kind),
    label: record.label,
    results: normalizeResults(record.results),
  };
  if (entry.results.length === 0) return;
  setState({
    ...state,
    sessions: [entry, ...state.sessions].slice(0, MAX_SESSIONS),
  });
}

/** Cria/atualiza a nota de uma questão; texto vazio apaga a nota. */
export function upsertNote(qid: string, text: string) {
  const clean = text.trim().slice(0, 2000);
  const next = { ...state.notes };
  if (!clean) {
    if (qid in next) {
      delete next[qid];
      setState({ ...state, notes: next });
    }
    return;
  }
  next[qid] = { text: clean, updatedAt: Date.now() };
  setState({ ...state, notes: next });
}

/** Zera histórico e favoritos, mas preserva os ajustes do usuário. */
export function resetProgress() {
  setState(emptyState(state.settings));
}

// ---------- backup (export/import JSON) ----------

export function exportBackup(): string {
  return JSON.stringify(
    {
      app: "pte-master-hub",
      version: 4,
      exportedAt: new Date().toISOString(),
      attempts: state.attempts,
      bookmarks: state.bookmarks,
      notes: state.notes,
      sessions: state.sessions,
      settings: state.settings,
    },
    null,
    2,
  );
}

export function importBackup(json: string): { ok: boolean; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "o arquivo não é um JSON válido" };
  }
  const obj = parsed as Record<string, unknown>;
  const version = obj["version"];
  const isCurrent =
    obj["app"] === "pte-master-hub" && (version === 2 || version === 3 || version === 4);
  const isLegacy = obj["app"] === "readaloud-trainer";
  if (!isCurrent && !isLegacy) {
    return { ok: false, error: "este arquivo não é um backup deste app" };
  }
  if (!Array.isArray(obj["attempts"])) {
    return { ok: false, error: "histórico de tentativas inválido" };
  }
  if (!Array.isArray(obj["bookmarks"])) {
    return { ok: false, error: "lista de favoritos inválida" };
  }
  const migrated = migrateLegacyState(obj);
  setState(migrated);
  return { ok: true };
}

// ---------- derivados (puros, testáveis) ----------

function scoreOf(a: Attempt): number | null {
  return a.score ?? a.contentScore;
}

export function computeStats(app: AppState): Map<string, QuestionStat> {
  const map = new Map<string, QuestionStat>();
  const DAY = 86400000;
  // ordem cronológica (backups importados podem vir fora de ordem)
  const ordered = [...app.attempts].sort((x, y) => x.ts - y.ts);
  for (const a of ordered) {
    const score = scoreOf(a);
    if (score === null) continue;
    const pass = score >= PASS_SCORE;
    const cur = map.get(a.qid);
    if (!cur) {
      const box = pass ? 1 : 0;
      map.set(a.qid, {
        attempts: 1,
        bestContent: score,
        bestWpm: a.mode === "speech" ? a.wpm : null,
        lastAttemptAt: a.ts,
        lastScore: score,
        strongAttempts: score >= STRONG_SCORE ? 1 : 0,
        box,
        dueAt: a.ts + SRS_INTERVAL_DAYS[box]! * DAY,
      });
    } else {
      cur.attempts += 1;
      cur.lastAttemptAt = Math.max(cur.lastAttemptAt, a.ts);
      cur.lastScore = score;
      if (score >= STRONG_SCORE) cur.strongAttempts += 1;
      cur.box = pass ? Math.min(cur.box + 1, SRS_INTERVAL_DAYS.length - 1) : 0;
      cur.dueAt = a.ts + SRS_INTERVAL_DAYS[cur.box]! * DAY;
      if (a.mode === "speech" && a.wpm !== null && (cur.bestWpm === null || a.wpm > cur.bestWpm)) {
        cur.bestWpm = a.wpm;
      }
      if (score > (cur.bestContent ?? -1)) {
        cur.bestContent = score;
      }
    }
  }
  return map;
}

/** Agregados por task type (para o dashboard por seção). */
export function computeTypeStats(app: AppState): Map<TaskType, TypeStat> {
  const map = new Map<TaskType, TypeStat>();
  const seenByType = new Map<TaskType, Set<string>>();
  for (const a of app.attempts) {
    const score = scoreOf(a);
    if (score === null) continue;
    const cur = map.get(a.taskType) ?? {
      attempts: 0,
      attemptedIds: 0,
      bestScore: null,
      lastAttemptAt: 0,
    };
    const seen = seenByType.get(a.taskType) ?? new Set<string>();
    const isNew = !seen.has(a.qid);
    seen.add(a.qid);
    cur.attempts += 1;
    if (isNew) cur.attemptedIds += 1;
    cur.lastAttemptAt = Math.max(cur.lastAttemptAt, a.ts);
    if (cur.bestScore === null || score > cur.bestScore) cur.bestScore = score;
    map.set(a.taskType, cur);
    seenByType.set(a.taskType, seen);
  }
  return map;
}

/**
 * "Dominada":
 *  - Read Aloud: melhor score ≥ 90 com ritmo de 120–160 ppm (critério original);
 *  - demais tipos: ≥ 2 tentativas fortes (≥ 90) e a última também forte.
 */
export function isMasteredStat(stat: QuestionStat | undefined, taskType?: TaskType): boolean {
  if (!stat) return false;
  if (taskType === undefined || taskType === "read_aloud") {
    return (
      (stat.bestContent ?? 0) >= STRONG_SCORE &&
      (stat.bestWpm ?? 0) >= 120 &&
      (stat.bestWpm ?? 0) <= 160
    );
  }
  return stat.strongAttempts >= 2 && (stat.lastScore ?? 0) >= STRONG_SCORE;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Streak de dias consecutivos com ao menos uma tentativa, contando a partir de hoje (ou ontem, se hoje ainda não treinou). */
export function computeStreak(app: AppState): number {
  if (app.attempts.length === 0) return 0;
  const days = new Set(app.attempts.map((a) => dayKey(a.ts)));
  const DAY = 86400000;
  const start = days.has(dayKey(Date.now())) ? Date.now() : Date.now() - DAY;
  let streak = 0;
  for (let t = start; days.has(dayKey(t)); t -= DAY) streak += 1;
  return streak;
}

export function attemptedToday(app: AppState): number {
  const today = dayKey(Date.now());
  const seen = new Set(app.attempts.filter((a) => dayKey(a.ts) === today).map((a) => a.qid));
  return seen.size;
}

/** Score médio das tentativas dos últimos `days` dias (null se nenhuma). */
export function recentAverage(app: AppState, days: number): number | null {
  const since = Date.now() - days * 86400000;
  const scores = app.attempts.filter((a) => scoreOf(a) !== null && a.ts >= since);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, a) => sum + (scoreOf(a) ?? 0), 0) / scores.length);
}

export function averageWpm(app: AppState): number | null {
  const wpms = app.attempts.filter((a) => a.wpm !== null && a.wpm > 0);
  if (wpms.length === 0) return null;
  return Math.round(wpms.reduce((sum, a) => sum + (a.wpm ?? 0), 0) / wpms.length);
}

/** Score médio por dia (últimos `days` dias), para o gráfico. */
export function dailyAverages(
  app: AppState,
  days: number,
): { day: string; score: number | null }[] {
  const out: { day: string; score: number | null }[] = [];
  const DAY = 86400000;
  for (let i = days - 1; i >= 0; i--) {
    const ts = Date.now() - i * DAY;
    const key = dayKey(ts);
    const scores = app.attempts.filter((a) => dayKey(a.ts) === key && scoreOf(a) !== null);
    out.push({
      day: key,
      score: scores.length
        ? Math.round(scores.reduce((s, a) => s + (scoreOf(a) ?? 0), 0) / scores.length)
        : null,
    });
  }
  return out;
}
