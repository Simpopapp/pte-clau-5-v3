// Meta do usuário — data da prova e pontuação-alvo. Puro e testável
// (sem React, sem localStorage). Consumido pela home, /progress e /settings.

import { isValidExamDate } from "@/lib/storage";

const DAY = 86_400_000;

/** Meia-noite local do dia contido no timestamp. */
function midnight(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Dias inteiros restantes até a prova (0 = hoje).
 * Retorna null quando não há data válida ou a prova já passou.
 */
export function daysUntil(examDate: string | null | undefined, now = Date.now()): number | null {
  if (!isValidExamDate(examDate)) return null;
  const [y, m, d] = (examDate as string).split("-").map(Number) as [number, number, number];
  const diff = Math.round((midnight(new Date(y, m - 1, d).getTime()) - midnight(now)) / DAY);
  return diff >= 0 ? diff : null;
}

export type TargetTone = "none" | "below" | "near" | "on";

export interface TargetVerdict {
  label: string;
  tone: TargetTone;
}

/**
 * Compara a média recente (%) com a pontuação-alvo.
 * Faixas: abaixo de alvo−15 = "abaixo", ±15 = "quase", ≥ alvo = "no alvo".
 */
export function targetVerdict(recentAvg: number | null, targetScore: number): TargetVerdict {
  if (recentAvg === null || !Number.isFinite(targetScore)) {
    return { label: "Sem dados suficientes", tone: "none" };
  }
  if (recentAvg >= targetScore) return { label: "No alvo", tone: "on" };
  if (recentAvg >= targetScore - 15) return { label: "Quase no alvo", tone: "near" };
  return { label: "Abaixo do alvo", tone: "below" };
}

/** Rótulo curto do countdown para a home (pt-BR). */
export function countdownLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "A prova é hoje!";
  if (days === 1) return "Falta 1 dia para a prova";
  return `Faltam ${days} dias para a prova`;
}
