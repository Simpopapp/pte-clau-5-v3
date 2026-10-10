import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { TYPE_META, getMeta, typeCounts, type TaskType } from "@/lib/pte";
import {
  countDue,
  countErrors,
  endSession,
  sessionFinished,
  sessionNextId,
  startDueSession,
  startMixedSession,
  startSession,
  type MixCounts,
  useSession,
} from "@/lib/session";
import { computeStats, useAppState } from "@/lib/storage";
import { buildDailyPlan } from "@/lib/pte/studyPlan";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/session")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { done?: true } = {};
    // o router serializa params como JSON (true/1) e links antigos usam "1"/"true"
    const d = search["done"];
    if (d === true || d === 1 || d === "1" || d === "true") out.done = true;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Sessão de treino — PTE Master Hub" },
      {
        name: "description",
        content: "Treine 5, 10 ou 15 questões seguidas, com fila inteligente e resumo final.",
      },
      { property: "og:title", content: "Sessão de treino — PTE Master Hub" },
      {
        property: "og:description",
        content: "Treine 5, 10 ou 15 questões seguidas, com fila inteligente e resumo final.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionPage,
});

const sizeOptions = [5, 10, 15];

function SessionPage() {
  const { done } = Route.useSearch();
  const navigate = useNavigate();
  const app = useAppState();
  const session = useSession();
  const [size, setSize] = useState(10);
  const stats = useMemo(() => computeStats(app), [app]);
  const dueN = countDue(stats);
  const errN = countErrors(stats);
  const [mix, setMix] = useState<MixCounts>({ read_aloud: 3, wfd: 5, repeat_sentence: 3 });
  const mixTotal = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0);

  // Plano do dia (fase 3): terceira entrada quando a meta diária permite distribuir.
  const plan = useMemo(() => buildDailyPlan(app, stats), [app, stats]);

  // Resumo da sessão concluída
  if (session.active && (done || sessionFinished())) {
    const graded = session.results.filter((r) => r.score !== null);
    const avg = graded.length
      ? Math.round(graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length)
      : null;
    const byType = new Map<TaskType, { sum: number; n: number }>();
    for (const r of session.results) {
      if (r.score === null) continue;
      const q = getMeta(r.qid);
      if (!q) continue;
      const cur = byType.get(q.taskType) ?? { sum: 0, n: 0 };
      cur.sum += r.score;
      cur.n += 1;
      byType.set(q.taskType, cur);
    }
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              Sessão concluída
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
              {session.results.length} questões concluídas
            </h1>
            {avg !== null ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Média de conteúdo: <span className="font-medium text-foreground">{avg}%</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Sem scores automáticos nesta sessão.
              </p>
            )}
          </div>

          {byType.size > 1 && (
            <div className="flex flex-wrap gap-2">
              {[...byType.entries()].map(([t, v]) => (
                <span
                  key={t}
                  className="rounded-full bg-secondary px-3 py-1 text-xs tabular-nums text-muted-foreground"
                >
                  {TYPE_META[t].label}: {Math.round(v.sum / v.n)}% · {v.n} questão(ões)
                </span>
              ))}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            {session.results.map((r, i) => {
              const q = getMeta(r.qid);
              return (
                <div
                  key={`${r.qid}-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-4 px-4 py-3",
                    i > 0 && "border-t border-border/60",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">
                    <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      {q ? TYPE_META[q.taskType].label : "—"}
                    </span>
                    {q?.topic ?? r.qid}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm tabular-nums",
                      r.score === null
                        ? "text-muted-foreground"
                        : r.score >= 90
                          ? "text-success"
                          : r.score >= 70
                            ? "text-warning"
                            : "text-destructive",
                    )}
                  >
                    {r.score === null ? "—" : `${r.score}% · ${r.wpm ?? "—"} ppm`}
                  </span>
                </div>
              );
            })}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              onClick={() => {
                endSession();
                setSize(size);
              }}
            >
              Nova sessão
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate({ to: "/" })}>
              Voltar ao início
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Sessão em andamento
  if (session.active) {
    const nextId = sessionNextId();
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Sessão em andamento</h1>
          <div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {session.index} de {session.size} concluídas
              </span>
              <span className="tabular-nums">
                {Math.round((session.index / Math.max(session.size, 1)) * 100)}%
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(session.index / Math.max(session.size, 1)) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={!nextId}
              onClick={() => nextId && navigate({ to: "/practice", search: { q: nextId } })}
            >
              Continuar sessão
            </Button>
            <Button size="lg" variant="outline" onClick={() => endSession()}>
              Encerrar sessão
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Configuração
  const history = app.sessions.slice(0, 10);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Sessão de treino</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Questões em sequência, intercalando task types: primeiro as revisões vencidas (repetição
            espaçada), depois questões novas.
          </p>
        </div>

        {history.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-muted-foreground">Sessões recentes</h2>
            <ul className="mt-3 divide-y divide-border/50">
              {history.map((s) => {
                const graded = s.results.filter((r) => r.score !== null);
                const avg = graded.length
                  ? Math.round(graded.reduce((sum, r) => sum + (r.score ?? 0), 0) / graded.length)
                  : null;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        {s.label}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(s.finishedAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {s.results.length} questões
                      {avg !== null ? ` · ${avg}%` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Quantas questões?</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {sizeOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                className={cn(
                  "rounded-full px-5 py-2.5 text-sm transition-colors",
                  size === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                Treinar {n}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {dueN} {dueN === 1 ? "revisão vencida" : "revisões vencidas"} · {errN}{" "}
            {errN === 1 ? "questão com erro recente" : "questões com erro recente"}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="lg"
              onClick={() => {
                startSession(size, stats);
                const first = sessionNextId();
                if (first) navigate({ to: "/practice", search: { q: first } });
              }}
            >
              Começar sessão de {size}
            </Button>
            <Button
              size="lg"
              disabled={dueN === 0}
              onClick={() => {
                startDueSession(Math.min(size, dueN), stats);
                const first = sessionNextId();
                if (first) navigate({ to: "/practice", search: { q: first } });
              }}
            >
              Fila do dia ({Math.min(size, dueN)})
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={errN === 0}
              onClick={() => {
                startSession(Math.min(size, errN), stats, { mode: "errors" });
                const first = sessionNextId();
                if (first) navigate({ to: "/practice", search: { q: first } });
              }}
            >
              Revisar erros ({Math.min(size, errN)})
            </Button>
            {plan.total > 0 ? (
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  startMixedSession(plan.counts, stats);
                  const first = sessionNextId();
                  if (first) navigate({ to: "/practice", search: { q: first } });
                }}
              >
                Plano de hoje ({plan.total})
              </Button>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Sessão mista</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Combine tipos de questão. Os tipos em que você vai pior aparecem primeiro, intercalados.
          </p>
          <div className="mt-4 divide-y divide-border/60">
            {(Object.keys(TYPE_META) as TaskType[])
              .filter((t) => TYPE_META[t].ready && typeCounts[t] > 0)
              .map((t) => {
                const n = mix[t] ?? 0;
                const set = (v: number) =>
                  setMix((m) => ({ ...m, [t]: Math.max(0, Math.min(typeCounts[t], v)) }));
                return (
                  <div key={t} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm">{TYPE_META[t].label}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Menos ${TYPE_META[t].label}`}
                        onClick={() => set(n - 1)}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">{n}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Mais ${TYPE_META[t].label}`}
                        onClick={() => set(n + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
          <Button
            size="lg"
            className="mt-5"
            disabled={mixTotal === 0}
            onClick={() => {
              startMixedSession(mix, stats);
              const first = sessionNextId();
              if (first) navigate({ to: "/practice", search: { q: first } });
            }}
          >
            Começar sessão mista de {mixTotal}
          </Button>
        </section>
      </main>
    </div>
  );
}
