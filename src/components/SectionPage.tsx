import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { QuestionRow } from "@/components/QuestionRow";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { SECTION_META, TYPE_META, firstIdOfType, loadQuestions, metaBySection } from "@/lib/pte";
import type { Section, TaskType } from "@/lib/pte/types";
import { computeStats, computeTypeStats, toggleBookmark, useAppState } from "@/lib/storage";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "untried" | "due" | "weak" | "starred";

/**
 * Task types cujo texto NÃO é a resposta (texto para ler / passagem de leitura): só estes mostram
 * pré-visualização na lista. Nos demais (ditado, repetição, listening…) o texto entregaria a resposta.
 */
const PREVIEW_TYPES: TaskType[] = ["read_aloud", "swt", "mcq_single", "mcq_multi"];

/** Carrega (sob demanda) os textos de pré-visualização dos task types seguros da seção. */
function usePreviewTexts(section: Section): Map<string, string> {
  const [texts, setTexts] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let alive = true;
    const types = PREVIEW_TYPES.filter((t) => TYPE_META[t].section === section);
    if (types.length === 0) return;
    loadQuestions(types)
      .then((list) => {
        if (alive) setTexts(new Map(list.map((q) => [q.id, q.text])));
      })
      .catch(() => {
        /* sem pré-visualização: a lista continua usável só com o manifesto */
      });
    return () => {
      alive = false;
    };
  }, [section]);
  return texts;
}

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "untried", label: "Não tentadas" },
  { value: "due", label: "Revisar hoje" },
  { value: "weak", label: "Precisam de treino" },
  { value: "starred", label: "★ Difíceis" },
];

const PAGE_SIZE = 50;

export function SectionPage({ section }: { section: Section }) {
  const app = useAppState();
  const stats = useMemo(() => computeStats(app), [app]);
  const typeStats = useMemo(() => computeTypeStats(app), [app]);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TaskType | "">("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const meta = SECTION_META[section];
  const sectionTypes = (Object.keys(TYPE_META) as TaskType[]).filter(
    (t) => TYPE_META[t].section === section,
  );
  const pool = useMemo(() => metaBySection(section), [section]);
  const previews = usePreviewTexts(section);
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pool.filter((q) => {
      if (type && q.taskType !== type) return false;
      if (needle) {
        const hay = `${q.topic} ${TYPE_META[q.taskType].label} ${previews.get(q.id) ?? ""}`;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      if (status === "untried") return !stats.has(q.id);
      if (status === "due") {
        const s = stats.get(q.id);
        return !!s && s.dueAt <= now;
      }
      if (status === "starred") return app.bookmarks.includes(q.id);
      if (status === "weak") {
        const s = stats.get(q.id);
        return !s || (s.bestContent ?? 0) < 90;
      }
      return true;
    });
  }, [pool, type, search, status, stats, app.bookmarks, previews, now]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  // Contagem por filtro (chip numérico no seletor de status).
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: pool.length,
      untried: 0,
      due: 0,
      weak: 0,
      starred: 0,
    };
    for (const q of pool) {
      const s = stats.get(q.id);
      if (!s) c.untried += 1;
      else if (s.dueAt <= now) c.due += 1;
      if (!s || (s.bestContent ?? 0) < 90) c.weak += 1;
      if (app.bookmarks.includes(q.id)) c.starred += 1;
    }
    return c;
  }, [pool, stats, app.bookmarks, now]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16">
        {/* Cabeçalho da seção */}
        <section className="py-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {meta.label}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            {meta.description}
          </h1>

          {/* Cards por task type */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {sectionTypes.map((t) => {
              const ts = typeStats.get(t);
              const count = pool.filter((q) => q.taskType === t).length;
              const pct = count > 0 ? Math.round(((ts?.attemptedIds ?? 0) / count) * 100) : 0;
              const ready = TYPE_META[t].ready;
              const card = (
                <div
                  className={cn(
                    "rounded-2xl border border-border bg-card p-4 transition-colors",
                    ready && "hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-base font-semibold">{TYPE_META[t].label}</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        ready ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {ready ? "praticar" : "em breve"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-3 text-sm">
                    <span className="tabular-nums text-muted-foreground">{count} questões</span>
                    {ts && (
                      <span className="tabular-nums text-muted-foreground">
                        · melhor {ts.bestScore}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
              const firstId = firstIdOfType(t);
              return ready && firstId ? (
                <Link key={t} to="/practice" search={{ q: firstId }} className="block">
                  {card}
                </Link>
              ) : (
                <div key={t}>{card}</div>
              );
            })}
          </div>
        </section>

        {/* Lista filtrável */}
        <section className="rounded-2xl border border-border bg-card">
          <div className="space-y-3 border-b border-border/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
                placeholder="Buscar por tópico ou tipo…"
                className="min-w-56 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring"
              />
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as TaskType | "");
                  setLimit(PAGE_SIZE);
                }}
                aria-label="Filtrar por tipo"
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Todos os tipos</option>
                {sectionTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusFilter);
                  setLimit(PAGE_SIZE);
                }}
                aria-label="Filtrar por status"
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({statusCounts[o.value]})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {visible.length} de {filtered.length} questão(ões) exibidas
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma questão encontrada — tente limpar os filtros.
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setType("");
                    setStatus("all");
                    setLimit(PAGE_SIZE);
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {visible.map((q, i) => (
                <QuestionRow
                  key={q.id}
                  meta={q}
                  number={i + 1}
                  preview={previews.get(q.id)}
                  stat={stats.get(q.id)}
                  bookmarked={app.bookmarks.includes(q.id)}
                  onToggleBookmark={toggleBookmark}
                  now={now}
                />
              ))}
              {filtered.length > visible.length && (
                <div className="border-t border-border/60 p-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  >
                    Mostrar mais ({filtered.length - visible.length} restantes)
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
