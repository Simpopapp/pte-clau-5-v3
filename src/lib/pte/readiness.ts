// Índice de prontidão por seção — puro e testável (decisão D3 do PRD).
// score = 40% cobertura + 40% score recente (7d) + 20% estabilidade (30d);
// componentes indisponíveis (null) redistribuem o peso entre os disponíveis,
// para não punir quem está começando.

import type { Attempt, AppState } from "../storage";
import { sectionCounts } from "./manifest";
import { SECTION_META, SECTION_ORDER, TYPE_META, type Section } from "./types";

const DAY = 86_400_000;

// Pesos inteiros (sobre 100) para a conta ficar estável em ponto flutuante.
const WEIGHT_COVERAGE = 40;
const WEIGHT_RECENT = 40;
const WEIGHT_STABILITY = 20;

export type ReadinessLevel = "Iniciando" | "Em progresso" | "Quase pronto" | "Pronto";

/** Rótulo por faixa do índice (decisão D3). */
export function readinessLevel(score: number): ReadinessLevel {
  if (score < 40) return "Iniciando";
  if (score < 65) return "Em progresso";
  if (score < 85) return "Quase pronto";
  return "Pronto";
}

export interface SectionReadiness {
  section: Section;
  label: string;
  /** Questões distintas da seção já tentadas com score. */
  attempted: number;
  /** Total de questões da seção no banco. */
  total: number;
  /** Cobertura 0–100 (tentadas/total). */
  coverage: number;
  /** Média das tentativas com score dos últimos 7 dias (null = sem dados). */
  recentScore: number | null;
  /** 1 − desvio-padrão normalizado das tentativas dos últimos 30 dias, 0–1 (null se < 2). */
  stability: number | null;
  /** Índice final 0–100 com pesos redistribuídos. */
  score: number;
  level: ReadinessLevel;
  /** ≥ 1 tentativa com score nesta seção. */
  hasData: boolean;
}

function scoreOf(a: Attempt): number | null {
  return a.score ?? a.contentScore;
}

/** 1 − (desvio-padrão / 100), limitado a 0–1; null com menos de 2 scores. */
function stabilityOf(scores: number[]): number | null {
  if (scores.length < 2) return null;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - std / 100));
}

/**
 * Prontidão das 4 seções. `totals` permite testar sem depender do banco real;
 * por padrão usa os totais do manifesto.
 */
export function readinessBySection(
  app: Pick<AppState, "attempts">,
  now = Date.now(),
  totals: Record<Section, number> = sectionCounts,
): SectionReadiness[] {
  const scored: { section: Section; qid: string; ts: number; score: number }[] = [];
  for (const a of app.attempts) {
    const s = scoreOf(a);
    if (s === null) continue;
    scored.push({ section: TYPE_META[a.taskType].section, qid: a.qid, ts: a.ts, score: s });
  }

  return SECTION_ORDER.map((section) => {
    const rows = scored.filter((r) => r.section === section);
    const total = totals[section] ?? 0;
    const attempted = new Set(rows.map((r) => r.qid)).size;
    const coverage = total > 0 ? Math.round((attempted / total) * 100) : 0;

    const recent = rows.filter((r) => r.ts >= now - 7 * DAY).map((r) => r.score);
    const recentScore =
      recent.length > 0 ? Math.round(recent.reduce((s, v) => s + v, 0) / recent.length) : null;

    const stability = stabilityOf(rows.filter((r) => r.ts >= now - 30 * DAY).map((r) => r.score));

    // Pesos redistribuídos entre componentes disponíveis (cobertura sempre existe).
    const parts: { w: number; v: number }[] = [
      { w: WEIGHT_COVERAGE, v: coverage },
      ...(recentScore !== null ? [{ w: WEIGHT_RECENT, v: recentScore }] : []),
      ...(stability !== null ? [{ w: WEIGHT_STABILITY, v: stability * 100 }] : []),
    ];
    const wSum = parts.reduce((s, p) => s + p.w, 0);
    const score = Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / wSum);

    return {
      section,
      label: SECTION_META[section].label,
      attempted,
      total,
      coverage,
      recentScore,
      stability,
      score,
      level: readinessLevel(score),
      hasData: rows.length > 0,
    };
  });
}

/**
 * Seção de menor índice entre as que têm dados; empate resolve pela ordem
 * canônica (speaking → writing → reading → listening). null se nada foi tentado.
 */
export function weakestSection(readiness: SectionReadiness[]): Section | null {
  let weakest: Section | null = null;
  let min = Infinity;
  for (const r of readiness) {
    if (!r.hasData) continue;
    if (r.score < min) {
      min = r.score;
      weakest = r.section;
    }
  }
  return weakest;
}
