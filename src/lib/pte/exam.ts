// Simulado PTE (modo exame) — plano de blocos, fila estratificada, tempos por
// questão e resumo comparativo. Puro e testável (sem React, sem localStorage).

import { getMeta, metaByType } from "./manifest";
import { SECTION_META, SECTION_ORDER, TYPE_META, type Section, type TaskType } from "./types";

export type ExamId = Section | "full";

export interface ExamBlock {
  taskType: TaskType;
  count: number;
  /** Tempo oficial aproximado por questão (s). */
  seconds: number;
}

/** Tempo oficial aproximado por questão (s), por task type. */
export const EXAM_SECONDS: Record<TaskType, number> = {
  read_aloud: 40,
  repeat_sentence: 15,
  retell_lecture: 50, // 10s de preparação + 40s de fala
  answer_short: 10,
  swt: 600,
  write_essay: 1200, // 20 min
  mcq_single: 120,
  mcq_multi: 150,
  reorder_paragraphs: 180,
  read_fib: 120,
  wfd: 25,
  lst_fib: 90,
  summarize_spoken_text: 600,
  lst_hiw: 120,
  lst_hcs: 120,
  lst_summary: 600,
  lst_smw: 120,
  lst_mcq: 120,
  lst_mcq_multi: 150,
};

/** Cronômetro de uma questão do simulado (s). */
export function examTiming(taskType: TaskType): number {
  return EXAM_SECONDS[taskType];
}

const SECTION_PLANS: Record<Section, ExamBlock[]> = {
  speaking: [
    { taskType: "read_aloud", count: 2, seconds: EXAM_SECONDS.read_aloud },
    { taskType: "repeat_sentence", count: 3, seconds: EXAM_SECONDS.repeat_sentence },
    { taskType: "retell_lecture", count: 1, seconds: EXAM_SECONDS.retell_lecture },
    { taskType: "answer_short", count: 2, seconds: EXAM_SECONDS.answer_short },
  ],
  writing: [
    { taskType: "swt", count: 2, seconds: EXAM_SECONDS.swt },
    { taskType: "write_essay", count: 1, seconds: EXAM_SECONDS.write_essay },
  ],
  reading: [
    { taskType: "mcq_single", count: 2, seconds: EXAM_SECONDS.mcq_single },
    { taskType: "mcq_multi", count: 1, seconds: EXAM_SECONDS.mcq_multi },
    { taskType: "reorder_paragraphs", count: 2, seconds: EXAM_SECONDS.reorder_paragraphs },
    { taskType: "read_fib", count: 2, seconds: EXAM_SECONDS.read_fib },
  ],
  listening: [
    { taskType: "wfd", count: 3, seconds: EXAM_SECONDS.wfd },
    { taskType: "lst_fib", count: 2, seconds: EXAM_SECONDS.lst_fib },
    { taskType: "summarize_spoken_text", count: 1, seconds: EXAM_SECONDS.summarize_spoken_text },
    { taskType: "lst_hiw", count: 1, seconds: EXAM_SECONDS.lst_hiw },
    { taskType: "lst_hcs", count: 1, seconds: EXAM_SECONDS.lst_hcs },
    { taskType: "lst_summary", count: 1, seconds: EXAM_SECONDS.lst_summary },
    { taskType: "lst_smw", count: 1, seconds: EXAM_SECONDS.lst_smw },
    { taskType: "lst_mcq", count: 1, seconds: EXAM_SECONDS.lst_mcq },
    { taskType: "lst_mcq_multi", count: 1, seconds: EXAM_SECONDS.lst_mcq_multi },
  ],
};

/** Plano do simulado: blocos em ordem de execução, por seção e integral. */
export const EXAM_PLAN: Record<ExamId, ExamBlock[]> = {
  ...SECTION_PLANS,
  full: SECTION_ORDER.flatMap((s) => SECTION_PLANS[s]!),
};

export function examLabel(examId: ExamId): string {
  return examId === "full" ? "Simulado completo" : `Simulado ${SECTION_META[examId]!.label}`;
}

/** Tempo total estimado do simulado (s), respeitando o que existe no banco. */
export function estimateSeconds(examId: ExamId): number {
  return EXAM_PLAN[examId]!.reduce(
    (sum, b) => sum + Math.min(b.count, metaByType(b.taskType).length) * b.seconds,
    0,
  );
}

/** Quantas questões o simulado tem (respeitando o que existe no banco). */
export function examQuestionCount(examId: ExamId): number {
  return EXAM_PLAN[examId]!.reduce(
    (sum, b) => sum + Math.min(b.count, metaByType(b.taskType).length),
    0,
  );
}

type Rand = () => number;

function shuffle<T>(list: T[], rand: Rand): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i]!, out[j]!] = [out[j]!, out[i]!];
  }
  return out;
}

/** Fila do simulado: amostra estratificada por bloco (respeita o estoque de cada tipo). */
export function buildExamQueue(examId: ExamId, rand: Rand = Math.random): string[] {
  const out: string[] = [];
  for (const block of EXAM_PLAN[examId]!) {
    const pool = metaByType(block.taskType);
    if (pool.length === 0) continue;
    const take = Math.min(block.count, pool.length);
    out.push(
      ...shuffle(pool, rand)
        .slice(0, take)
        .map((m) => m.id),
    );
  }
  return out;
}

// ---------- Resumo comparativo ----------

export interface ExamResultRow {
  qid: string;
  score: number | null;
}

/** Tentativa histórica de prática (para comparar com o simulado). */
export interface HistoryAttempt {
  taskType: TaskType;
  score: number | null;
  tags?: string[];
}

export interface ExamTypeSummary {
  taskType: TaskType;
  label: string;
  section: Section;
  avg: number | null;
  n: number;
  /** Média histórica de prática (sem exames) — null se nunca treinou. */
  practiceAvg: number | null;
}

export interface ExamSummary {
  gradedCount: number;
  totalCount: number;
  overall: number | null;
  bySection: { section: Section; label: string; avg: number | null; n: number }[];
  byType: ExamTypeSummary[];
  /** Tipos com média < 70 (mais fracos primeiro). */
  weakest: ExamTypeSummary[];
}

/**
 * Resume um simulado: média geral, por seção e por tipo, comparando com a média
 * histórica de prática (tentativas sem a tag "exam").
 */
export function gradeExamSummary(
  results: ExamResultRow[],
  history: HistoryAttempt[] = [],
): ExamSummary {
  const groups = new Map<TaskType, { sum: number; n: number }>();
  for (const r of results) {
    if (r.score === null) continue;
    const m = getMeta(r.qid);
    if (!m) continue;
    const g = groups.get(m.taskType) ?? { sum: 0, n: 0 };
    g.sum += r.score;
    g.n += 1;
    groups.set(m.taskType, g);
  }

  const practice = new Map<TaskType, { sum: number; n: number }>();
  for (const a of history) {
    if (a.score === null || a.tags?.includes("exam")) continue;
    const p = practice.get(a.taskType) ?? { sum: 0, n: 0 };
    p.sum += a.score;
    p.n += 1;
    practice.set(a.taskType, p);
  }

  const avgOf = (g?: { sum: number; n: number }) => (g && g.n > 0 ? Math.round(g.sum / g.n) : null);

  const byType: ExamTypeSummary[] = [...groups.entries()]
    .map(([taskType, g]) => ({
      taskType,
      label: TYPE_META[taskType]!.label,
      section: TYPE_META[taskType]!.section,
      avg: Math.round(g.sum / g.n),
      n: g.n,
      practiceAvg: avgOf(practice.get(taskType)),
    }))
    .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0));

  const bySection = SECTION_ORDER.map((section) => {
    const rows = byType.filter((t) => t.section === section);
    const n = rows.reduce((s, t) => s + t.n, 0);
    const weighted = rows.reduce((s, t) => s + (t.avg ?? 0) * t.n, 0);
    return {
      section,
      label: SECTION_META[section]!.label,
      avg: n > 0 ? Math.round(weighted / n) : null,
      n,
    };
  });

  const graded = results.filter((r) => r.score !== null);
  const overall = graded.length
    ? Math.round(graded.reduce((s, r) => s + (r.score ?? 0), 0) / graded.length)
    : null;

  return {
    gradedCount: graded.length,
    totalCount: results.length,
    overall,
    bySection,
    byType,
    weakest: byType.filter((t) => (t.avg ?? 0) < 70).slice(0, 4),
  };
}
