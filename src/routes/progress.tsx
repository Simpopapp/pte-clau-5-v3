import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { TYPE_COUNT, TYPE_META, getMeta, type TaskType } from "@/lib/pte";
import { diagnoseAttempts, TAG_LABELS } from "@/lib/pte/diagnostics";
import { readinessBySection, weakestSection } from "@/lib/pte/readiness";
import { renderReportJson, renderReportMarkdown, weeklyReport } from "@/lib/pte/report";
import { periodComparison, weeklyTypeAverages } from "@/lib/progress-analytics";
import {
  computeStats,
  computeStreak,
  dailyAverages,
  isMasteredStat,
  resetProgress,
  useAppState,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progresso — PTE Master Hub" },
      {
        name: "description",
        content: `Seu histórico, ritmo e evolução nos ${TYPE_COUNT} task types do PTE.`,
      },
      { property: "og:title", content: "Progresso — PTE Master Hub" },
      {
        property: "og:description",
        content: `Seu histórico e evolução nos ${TYPE_COUNT} task types do PTE.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  const app = useAppState();
  const navigate = useNavigate();
  const stats = useMemo(() => computeStats(app), [app]);
  const [confirmReset, setConfirmReset] = useState(false);

  const series = dailyAverages(app, 14);
  const chartPoints = series
    .map((d, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * 100;
      const y = d.score === null ? null : 100 - d.score;
      return { x, y, score: d.score, day: d.day };
    })
    .filter((p): p is { x: number; y: number; score: number; day: string } => p.y !== null);

  const topicScores = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const [qid, s] of stats) {
      const topic = getMeta(qid)?.topic;
      if (!topic || topic === "sem tópico" || s.bestContent === null) continue;
      const cur = acc.get(topic) ?? { sum: 0, n: 0 };
      acc.set(topic, { sum: cur.sum + s.bestContent, n: cur.n + 1 });
    }
    return [...acc.entries()]
      .map(([topic, { sum, n }]) => ({ topic, avg: Math.round(sum / n), n }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);
  }, [stats]);

  // Diagnóstico por task type: média da última tentativa, dominadas e revisões vencidas.
  const byType = useMemo(() => {
    const now = Date.now();
    const acc = new Map<
      TaskType,
      { n: number; sum: number; mastered: number; due: number; errors: number }
    >();
    for (const [qid, s] of stats) {
      const t = getMeta(qid)?.taskType;
      if (!t) continue;
      const cur = acc.get(t) ?? { n: 0, sum: 0, mastered: 0, due: 0, errors: 0 };
      cur.n += 1;
      cur.sum += s.lastScore ?? 0;
      if (isMasteredStat(s, t)) cur.mastered += 1;
      if (s.dueAt <= now) cur.due += 1;
      if ((s.lastScore ?? 100) < 70) cur.errors += 1;
      acc.set(t, cur);
    }
    return [...acc.entries()]
      .map(([t, v]) => ({ t, ...v, avg: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.avg - b.avg);
  }, [stats]);

  // Questões já tentadas que ainda precisam de treino (sem revelar o texto de tipos auditivos).
  const weak = useMemo(() => {
    return [...stats.entries()]
      .filter(([, s]) => (s.bestContent ?? 0) < 90)
      .sort((a, b) => (a[1].bestContent ?? 0) - (b[1].bestContent ?? 0))
      .slice(0, 10)
      .flatMap(([qid, s]) => {
        const m = getMeta(qid);
        return m ? [{ meta: m, best: s.bestContent ?? 0 }] : [];
      });
  }, [stats]);

  const recent = [...app.attempts].sort((a, b) => b.ts - a.ts).slice(0, 20);
  const streak = computeStreak(app);
  const diagnostics = useMemo(() => diagnoseAttempts(app.attempts), [app.attempts]);
  const comparison = useMemo(() => periodComparison(app.attempts), [app.attempts]);
  const weekly = useMemo(() => weeklyTypeAverages(app.attempts, 6).slice(0, 6), [app.attempts]);
  const readiness = useMemo(() => readinessBySection(app), [app]);
  const weakSection = useMemo(() => weakestSection(readiness), [readiness]);

  // Relatório semanal (fase 4): derivado do estado atual, sem ocupar localStorage.
  const report = useMemo(() => weeklyReport(app), [app]);
  const reportMarkdown = useMemo(() => renderReportMarkdown(report), [report]);
  const [reportOpen, setReportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportMarkdown);
    } catch {
      // Fallback sem permissão de clipboard (navegadores antigos / iframe).
      const ta = document.createElement("textarea");
      ta.value = reportMarkdown;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16">
        <div className="flex items-end justify-between py-8">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Progresso</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {app.attempts.length === 0
                ? "Sua primeira leitura começa o histórico."
                : `${streak} dia(s) de sequência · ${app.attempts.length} tentativa(s) registradas`}
            </p>
          </div>
          <Button onClick={() => navigate({ to: "/practice" })}>Treinar agora</Button>
        </div>

        {/* Prontidão por seção */}
        <section id="readiness" className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">Prontidão por seção</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Índice 0–100 = 40% cobertura do banco + 40% média dos últimos 7 dias + 20% estabilidade
            (consistência dos últimos 30 dias). Componentes sem dados redistribuem o peso — começar
            do zero não é punido.
          </p>
          {readiness.every((r) => !r.hasData) ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Sem tentativas ainda — a prontidão aparece após seus primeiros treinos.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {readiness.map((r) => (
                <div
                  key={r.section}
                  className={cn(
                    "rounded-xl border p-3",
                    r.section === weakSection && r.hasData
                      ? "border-primary/50 bg-primary/5"
                      : "border-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {r.label}
                      {r.section === weakSection && r.hasData ? (
                        <span className="ml-2 text-xs font-normal text-primary">mais fraca</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {r.attempted}/{r.total} cobertas ({r.coverage}%)
                      </span>
                      <span className="tabular-nums">
                        7d: {r.recentScore === null ? "—" : `${r.recentScore}%`}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          r.level === "Pronto"
                            ? "bg-success/10 text-success"
                            : r.level === "Quase pronto"
                              ? "bg-warning/10 text-warning"
                              : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {r.level}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        r.score >= 85
                          ? "bg-success"
                          : r.score >= 65
                            ? "bg-warning"
                            : "bg-destructive/70",
                      )}
                      style={{ width: `${r.score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                    índice {r.score}/100
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Gráfico 14 dias */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Conteúdo médio — últimos 14 dias
          </h2>
          <div className="relative mt-4 h-40">
            {chartPoints.length < 2 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Treine em pelo menos dois dias para ver a curva de evolução.
              </p>
            ) : (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                <polyline
                  points={chartPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                {chartPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="1.2" fill="var(--color-primary)" />
                ))}
              </svg>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{series[0]?.day.slice(5)}</span>
            <span>{series[series.length - 1]?.day.slice(5)}</span>
          </div>
        </section>

        {/* Comparação de períodos (7d vs. 7d anteriores) */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Últimos 7 dias vs. 7 anteriores
          </h2>
          {comparison.current === null && comparison.previous === null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Sem tentativas com score nas últimas duas semanas.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-8">
              <div>
                <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                <p className="font-serif text-2xl font-semibold tabular-nums">
                  {comparison.current !== null ? `${comparison.current}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {comparison.currentCount} tentativa(s)
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">7 dias anteriores</p>
                <p className="font-serif text-2xl font-semibold tabular-nums text-muted-foreground">
                  {comparison.previous !== null ? `${comparison.previous}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {comparison.previousCount} tentativa(s)
                </p>
              </div>
              {comparison.delta !== null ? (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium tabular-nums",
                    comparison.delta >= 0
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {comparison.delta >= 0 ? "▲" : "▼"} {Math.abs(comparison.delta)} pts
                </span>
              ) : null}
            </div>
          )}
        </section>

        {/* Evolução semanal por task type */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Evolução semanal por tipo (6 semanas)
          </h2>
          {weekly.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sem tentativas com score ainda.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {weekly.map((row) => (
                <div key={row.taskType}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground/85">{row.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.attempts} tentativa(s)
                    </span>
                  </div>
                  <div className="mt-1 flex items-end gap-1.5">
                    {[...row.weeks].reverse().map((avg, i) => (
                      <div
                        key={i}
                        title={avg !== null ? `${avg}%` : "sem treino nesta semana"}
                        className="flex h-10 flex-1 items-end overflow-hidden rounded-sm bg-secondary/60"
                      >
                        <div
                          className={cn(
                            "w-full rounded-sm",
                            avg === null
                              ? ""
                              : avg >= 90
                                ? "bg-success"
                                : avg >= 70
                                  ? "bg-warning"
                                  : "bg-destructive",
                          )}
                          style={{ height: `${avg ?? 0}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                Da esquerda para a direita: semanas mais antigas → semana atual.
              </p>
            </div>
          )}
        </section>

        {/* Diagnóstico por task type */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Diagnóstico por task type (mais fraco primeiro)
          </h2>
          {byType.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sem tentativas ainda.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      Tipo
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Última (média)
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Tentadas
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Dominadas
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Revisar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {byType.map((r) => (
                    <tr key={r.t}>
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {TYPE_META[r.t].label}
                      </th>
                      <td
                        className={cn(
                          "py-2 text-right tabular-nums",
                          r.avg >= 90
                            ? "text-success"
                            : r.avg >= 70
                              ? "text-warning"
                              : "text-destructive",
                        )}
                      >
                        {r.avg}%
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{r.n}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.mastered}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {r.due}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Diagnóstico de erros */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Padrões de erro
            <span className="ml-2 font-normal text-foreground/60">
              {diagnostics.taggedCount} de {diagnostics.totalCount} tentativa(s)
            </span>
          </h2>
          {diagnostics.tags.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Sem padrões de erro ainda — pratique para gerar o diagnóstico.
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {diagnostics.tags.map(({ tag, count }) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs tabular-nums"
                  >
                    {TAG_LABELS[tag]} <span className="font-semibold text-foreground">{count}</span>
                  </span>
                ))}
              </div>
              {diagnostics.missedWords.length > 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Palavras mais faltadas no ditado:{" "}
                  {diagnostics.missedWords.map((w) => w.word).join(", ")}
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* Tópicos */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground">Melhor score por tópico</h2>
          {topicScores.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sem tentativas ainda.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {topicScores.map((t) => (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-xs text-muted-foreground">
                    {t.topic}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        t.avg >= 90 ? "bg-success" : t.avg >= 70 ? "bg-warning" : "bg-destructive",
                      )}
                      style={{ width: `${t.avg}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums">{t.avg}%</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Precisam de treino */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-muted-foreground">Precisam de treino</h2>
            {weak.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nada abaixo de 90% entre as questões que você já tentou.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {weak.map(({ meta, best }) => (
                  <li key={meta.id}>
                    <Link
                      to="/practice"
                      search={{ q: meta.id }}
                      className="flex items-center justify-between gap-3 text-sm text-foreground/85 hover:text-foreground"
                    >
                      <span className="min-w-0 truncate">
                        {TYPE_META[meta.taskType].label} · {meta.topic}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {best}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Últimas tentativas */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-muted-foreground">Últimas tentativas</h2>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma tentativa ainda.</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {recent.map((a, i) => {
                  const score = a.score ?? a.contentScore;
                  return (
                    <li
                      key={`${a.qid}-${a.ts}-${i}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-muted-foreground">
                        {new Date(a.ts).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {TYPE_META[a.taskType]?.label ?? a.taskType}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 tabular-nums",
                          score === null
                            ? "text-muted-foreground"
                            : score >= 90
                              ? "text-success"
                              : score >= 70
                                ? "text-warning"
                                : "text-destructive",
                        )}
                      >
                        {score === null ? "sem score" : `${score}%`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Relatório semanal (fase 4) */}
        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-serif text-lg font-semibold">Relatório semanal</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Snapshot interpretável dos últimos 7 dias ({report.period.from} a {report.period.to}
                ).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setReportOpen((v) => !v)}>
                {reportOpen ? "Ocultar" : "Ver relatório"}
              </Button>
              <Button size="sm" onClick={copyReport}>
                {copied ? "Copiado!" : "Copiar relatório"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadFile(
                    reportMarkdown,
                    `relatorio-pte-${report.period.to}.md`,
                    "text/markdown",
                  )
                }
              >
                Baixar .md
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadFile(
                    renderReportJson(report),
                    `relatorio-pte-${report.period.to}.json`,
                    "application/json",
                  )
                }
              >
                Baixar .json
              </Button>
            </div>
          </div>
          {reportOpen ? (
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-xs leading-relaxed">
              {reportMarkdown}
            </pre>
          ) : null}
        </section>

        {/* Zerar */}
        <section className="mt-8 flex items-center justify-between rounded-2xl border border-border/60 p-5">
          <p className="text-sm text-muted-foreground">
            Zerar apaga todo o histórico, favoritos e sequência.
          </p>
          {confirmReset ? (
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => resetProgress()}>
                Confirmar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setConfirmReset(true)}
            >
              Zerar progresso
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}
