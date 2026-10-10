import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { ProgressRing } from "@/components/ProgressRing";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import {
  SECTION_META,
  SECTION_ORDER,
  TYPE_META,
  TYPE_COUNT,
  firstIdOfType,
  metaBySection,
  TOTAL_ALL_QUESTIONS_LABEL,
} from "@/lib/pte";
import { buildQueue, countDue, countDueByType } from "@/lib/session";
import {
  attemptedToday,
  averageWpm,
  computeStats,
  computeStreak,
  computeTypeStats,
  recentAverage,
  useAppState,
} from "@/lib/storage";
import { countdownLabel, daysUntil, targetVerdict } from "@/lib/pte/goal";
import { readinessBySection, weakestSection } from "@/lib/pte/readiness";
import { buildDailyPlan, planSummary } from "@/lib/pte/studyPlan";
import { startMixedSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `PTE Master Hub — treino dos ${TYPE_COUNT} task types do PTE` },
      {
        name: "description",
        content: `Pratique ${TYPE_COUNT} tipos de questão do PTE (${TOTAL_ALL_QUESTIONS_LABEL} questões de treino) — Speaking, Writing, Reading e Listening — com correção detalhada, revisão espaçada e progresso local.`,
      },
      {
        property: "og:title",
        content: `PTE Master Hub — treino dos ${TYPE_COUNT} task types do PTE`,
      },
      {
        property: "og:description",
        content: `${TOTAL_ALL_QUESTIONS_LABEL} questões de treino do PTE em uma plataforma única, com revisão espaçada.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const app = useAppState();
  const stats = useMemo(() => computeStats(app), [app]);
  const typeStats = useMemo(() => computeTypeStats(app), [app]);

  const todayCount = attemptedToday(app);
  const goal = app.settings.dailyGoal;
  const streak = computeStreak(app);
  const avg7 = recentAverage(app, 7);
  const wpm = averageWpm(app);

  const dueCount = countDue(stats);
  const dueByType = useMemo(() => countDueByType(stats), [stats]);

  const examDays = daysUntil(app.settings.examDate);
  const examCountdown = countdownLabel(examDays);
  const verdict = targetVerdict(avg7, app.settings.targetScore);

  // Prontidão por seção (fase 2): chip compacto por card + destaque da mais fraca.
  const readinessRows = useMemo(() => readinessBySection(app), [app]);
  const weakSection = useMemo(() => weakestSection(readinessRows), [readinessRows]);

  // Plano do dia (fase 3): distribuição da meta diária pelos pesos do exame.
  const plan = useMemo(() => buildDailyPlan(app, stats), [app, stats]);
  const planDue = useMemo(
    () => Object.values(plan.dueCounts).reduce((a, b) => a + (b ?? 0), 0),
    [plan],
  );
  const startPlan = () => {
    startMixedSession(plan.counts, stats);
    navigate({ to: "/session" });
  };

  // Próxima questão sugerida pela fila inteligente (revisões vencidas → novas), calculada no clique.
  const continueTraining = () => {
    const next = buildQueue(computeStats(app), 1)[0] ?? firstIdOfType("read_aloud");
    navigate({ to: "/practice", search: next ? { q: next } : {} });
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16">
        {/* Hero */}
        <section className="flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              {streak > 0
                ? `${streak} dia${streak > 1 ? "s" : ""} seguido${streak > 1 ? "s" : ""} de treino`
                : "Comece sua sequência hoje"}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight md:text-4xl">
              Todos os {TYPE_COUNT} tipos do PTE.{" "}
              <span className="text-primary">Um só treino.</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {TOTAL_ALL_QUESTIONS_LABEL} questões de treino de Speaking, Writing, Reading e
              Listening — com correção detalhada, revisão espaçada e progresso salvo no seu
              navegador.
            </p>
            {dueCount > 0 ? (
              <p className="mt-2 text-sm">
                <Link to="/session" className="font-medium text-primary hover:underline">
                  {dueCount} {dueCount === 1 ? "revisão vencida" : "revisões vencidas"} para hoje →
                </Link>
              </p>
            ) : null}
            {examCountdown ? (
              <p className="mt-2 text-sm">
                <Link to="/settings" className="font-medium text-primary hover:underline">
                  {examCountdown}
                  {verdict.tone !== "none"
                    ? ` · ${verdict.label} (média ${avg7}% / alvo ${app.settings.targetScore})`
                    : ""}
                </Link>
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="lg" onClick={continueTraining}>
                {app.attempts.length === 0 ? "Começar agora" : "Continuar treino"}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate({ to: "/session" })}>
                Sessão de treino
              </Button>
              <Button size="lg" variant="ghost" onClick={() => navigate({ to: "/progress" })}>
                Ver progresso
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <ProgressRing value={goal > 0 ? todayCount / goal : 0} size={96}>
              <div className="text-center">
                <div className="font-serif text-xl font-semibold">{todayCount}</div>
                <div className="text-[10px] text-muted-foreground">de {goal} hoje</div>
              </div>
            </ProgressRing>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Média 7 dias</dt>
                <dd className="font-medium">{avg7 === null ? "—" : `${avg7}%`}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ritmo médio</dt>
                <dd className="font-medium">{wpm === null ? "—" : `${wpm} ppm`}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Plano de hoje (fase 3) */}
        {plan.total > 0 ? (
          <section className="mt-2 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-lg font-semibold">Plano de hoje</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{planSummary(plan)}</p>
                {planDue > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inclui {planDue} {planDue === 1 ? "revisão vencida" : "revisões vencidas"}{" "}
                    (repetição espaçada).
                  </p>
                ) : null}
              </div>
              <Button onClick={startPlan}>Iniciar plano</Button>
            </div>
          </section>
        ) : null}

        {/* Prontidão: resumo + link para o painel completo */}
        {readinessRows.some((r) => r.hasData) ? (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {weakSection ? (
                <>
                  Seção mais fraca:{" "}
                  <span className="font-medium text-foreground">
                    {SECTION_META[weakSection].label}
                  </span>
                </>
              ) : null}
            </p>
            <Link
              to="/progress"
              hash="readiness"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver prontidão →
            </Link>
          </div>
        ) : null}

        {/* Dashboard por seção */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {SECTION_ORDER.map((section) => {
            const meta = SECTION_META[section];
            const types = (Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).filter(
              (t) => TYPE_META[t].section === section,
            );
            const sectionTotal = metaBySection(section).length;
            const attempted = types.reduce((n, t) => n + (typeStats.get(t)?.attemptedIds ?? 0), 0);
            const pct = sectionTotal > 0 ? Math.round((attempted / sectionTotal) * 100) : 0;
            const sectionDue = types.reduce((n, t) => n + (dueByType.get(t) ?? 0), 0);
            const readiness = readinessRows.find((r) => r.section === section);
            return (
              <section
                key={section}
                className={cn(
                  "rounded-2xl border border-border bg-card",
                  section === weakSection && "border-primary/50 ring-1 ring-primary/30",
                )}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border/60 p-4">
                  <div>
                    <h2 className="font-serif text-lg font-semibold">{meta.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {sectionTotal} questões · {attempted} iniciadas · {pct}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {readiness?.hasData ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                          section === weakSection
                            ? "bg-warning/10 text-warning"
                            : "bg-success/10 text-success",
                        )}
                        title={`Prontidão: índice ${readiness.score}/100 · ${readiness.level}`}
                      >
                        {readiness.score} · {readiness.level}
                      </span>
                    ) : null}
                    {sectionDue > 0 ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                        {sectionDue} vencida{sectionDue > 1 ? "s" : ""} hoje
                      </span>
                    ) : null}
                    <Link
                      to={`/${section}`}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary"
                    >
                      Abrir seção →
                    </Link>
                  </div>
                </div>
                <div className="px-4 pt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <ul className="divide-y divide-border/40">
                  {types.map((t) => {
                    const ts = typeStats.get(t);
                    const count = metaBySection(section).filter((q) => q.taskType === t).length;
                    const firstId = firstIdOfType(t);
                    return (
                      <li
                        key={t}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <span className="min-w-0 truncate text-foreground/90">
                          {TYPE_META[t].label}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">{count}</span>
                          {ts ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 tabular-nums text-primary">
                              melhor {ts.bestScore}%
                            </span>
                          ) : (
                            <span className="rounded-full bg-secondary px-2 py-0.5">novo</span>
                          )}
                          {TYPE_META[t].ready && firstId ? (
                            <Link
                              to="/practice"
                              search={{ q: firstId }}
                              className="rounded-md px-2 py-0.5 font-medium text-primary hover:bg-secondary"
                            >
                              praticar
                            </Link>
                          ) : (
                            <span className="px-2 py-0.5 text-muted-foreground/50">em breve</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {TYPE_COUNT} task types com motor de prática · {TOTAL_ALL_QUESTIONS_LABEL} questões. Ainda
          não cobertos: Describe Image (aguardando fontes com imagens acessíveis). Seu progresso
          fica salvo neste navegador.
        </p>
      </main>
    </div>
  );
}
