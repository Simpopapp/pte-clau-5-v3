import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { TYPE_META, type QuestionMeta, type UnifiedQuestion } from "@/lib/pte";
import {
  completeSessionItem,
  isSessionItem,
  sessionFinished,
  sessionNextId,
  useSession,
} from "@/lib/session";
import { computeStats, toggleBookmark, upsertNote, useAppState } from "@/lib/storage";
import { cn } from "@/lib/utils";

const NOTES_MAX = 2000;

/** Barra da sessão mista: detecta a tentativa da questão atual e oferece a próxima. */
function SessionBanner({ qid }: { qid: string }) {
  const session = useSession();
  const app = useAppState();
  const navigate = useNavigate();
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    mountedAt.current = Date.now();
  }, [qid]);

  useEffect(() => {
    if (!session.active || sessionNextId() !== qid) return;
    const last = app.attempts[app.attempts.length - 1];
    if (last && last.qid === qid && last.ts >= mountedAt.current) {
      completeSessionItem({ qid, score: last.score ?? null, wpm: last.wpm ?? null });
    }
  }, [app.attempts, qid, session.active]);

  if (!session.active || !isSessionItem(qid)) return null;
  const pct = (session.index / Math.max(session.size, 1)) * 100;
  const current = sessionNextId() === qid;
  const nid = sessionNextId();
  return (
    <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Sessão · {session.index} de {session.size}
        </span>
        {!current ? (
          sessionFinished() ? (
            <Button size="sm" onClick={() => navigate({ to: "/session", search: { done: true } })}>
              Ver resumo
            </Button>
          ) : nid ? (
            <Button size="sm" onClick={() => navigate({ to: "/practice", search: { q: nid } })}>
              Próxima da sessão →
            </Button>
          ) : null
        ) : null}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Overlay com a lista de atalhos de teclado (tecla ?). */
function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const items: [string, string][] = [
    ["← / K", "Questão anterior"],
    ["→ / J", "Próxima questão"],
    ["B", "Favoritar / desfavoritar"],
    ["N", "Abrir / fechar nota"],
    ["?", "Esta lista de atalhos"],
    ["Esc", "Fechar"],
  ];
  return (
    <div
      role="dialog"
      aria-label="Atalhos de teclado"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-lg font-semibold">Atalhos de teclado</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {items.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs">
                {key}
              </kbd>
              <span className="text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
        <Button size="sm" className="mt-5 w-full" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

interface PracticeShellProps {
  question: UnifiedQuestion;
  /** Pool navegável (todas as questões do mesmo task type). */
  pool: QuestionMeta[];
  children: ReactNode;
  /** Texto de status no canto esquerdo da barra inferior. */
  footerText: ReactNode;
  /** Ações no canto direito da barra inferior. */
  footerActions: ReactNode;
}

/** Moldura compartilhada dos motores de prática (header com navegação + barra inferior). */
export function PracticeShell({
  question,
  pool,
  children,
  footerText,
  footerActions,
}: PracticeShellProps) {
  const app = useAppState();
  const navigate = useNavigate();
  const stats = useMemo(() => computeStats(app), [app]);

  // ---- Nota por questão (abre com N, salva com debounce de 400 ms) ----
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const notesRef = useRef(app.notes);
  notesRef.current = app.notes;

  // No SSR a hidratação começa com o snapshot vazio (getServerSnapshot); o efeito
  // de montagem rodaria com notas ausentes. Por isso o rascunho é recarregado
  // do estado atual sempre que a nota é aberta ou a questão muda.
  const loadDraft = useCallback(
    (qid: string) => setNoteDraft(notesRef.current[qid]?.text ?? ""),
    [],
  );

  useEffect(() => {
    loadDraft(question.id);
    setNotesOpen(false);
  }, [loadDraft, question.id]);

  const openNotes = (open: boolean) => {
    if (open) loadDraft(question.id);
    setNotesOpen(open);
  };

  useEffect(() => {
    if (noteDraft === (notesRef.current[question.id]?.text ?? "")) return;
    const t = window.setTimeout(() => {
      upsertNote(question.id, noteDraft);
    }, 400);
    return () => window.clearTimeout(t);
  }, [noteDraft, question.id]);

  const storedNote = app.notes[question.id]?.text ?? "";
  const noteSaved = noteDraft === storedNote;

  // ---- Agenda da questão ----
  const dueAt = stats.get(question.id)?.dueAt;
  const dueLabel = useMemo(() => {
    if (!dueAt) return null;
    const now = Date.now();
    if (dueAt <= now) return "Revisar hoje";
    const days = Math.ceil((dueAt - now) / 86_400_000);
    return `Revisão em ${days} ${days === 1 ? "dia" : "dias"}`;
  }, [dueAt, app.attempts.length]);

  const idx = Math.max(
    0,
    pool.findIndex((p) => p.id === question.id),
  );
  const number = idx + 1;
  const prevId = pool[(idx - 1 + pool.length) % pool.length]?.id;
  const nextId = pool[(idx + 1) % pool.length]?.id;
  const bookmarked = app.bookmarks.includes(question.id);

  // ---- Atalhos de teclado (ignorados enquanto digita) ----
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowLeft":
        case "k":
        case "K":
          if (prevId) {
            e.preventDefault();
            navigate({ to: "/practice", search: { q: prevId } });
          }
          break;
        case "ArrowRight":
        case "j":
        case "J":
          if (nextId) {
            e.preventDefault();
            navigate({ to: "/practice", search: { q: nextId } });
          }
          break;
        case "b":
        case "B":
          toggleBookmark(question.id);
          break;
        case "n":
        case "N":
          setNotesOpen((v) => {
            if (!v) loadDraft(question.id);
            return !v;
          });
          break;
        case "?":
          setShowHelp((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, question.id, navigate]);

  const hasNote = storedNote.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-44">
        {/* Cabeçalho da questão */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-serif text-base font-semibold text-foreground">
              {TYPE_META[question.taskType].label} · Questão {number}{" "}
              <span className="text-muted-foreground">/ {pool.length}</span>
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5">{question.topic}</span>
            <span>{question.wordCount} palavras</span>
            {dueLabel ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5",
                  dueLabel === "Revisar hoje"
                    ? "bg-primary/10 font-medium text-primary"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {dueLabel}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Atalhos de teclado"
              title="Atalhos (?)"
              className="text-muted-foreground"
              onClick={() => setShowHelp(true)}
            >
              ?
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Marcar como difícil"
              className={cn("text-base", bookmarked ? "text-primary" : "text-muted-foreground")}
              onClick={() => toggleBookmark(question.id)}
            >
              ★
            </Button>
            {prevId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/practice", search: { q: prevId } })}
              >
                ← Anterior
              </Button>
            ) : null}
            {nextId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/practice", search: { q: nextId } })}
              >
                Próxima →
              </Button>
            ) : null}
          </div>
        </div>

        {/* Nota da questão */}
        <div className="mb-5">
          <button
            type="button"
            onClick={() => openNotes(!notesOpen)}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {notesOpen ? "▾" : "▸"} Nota{hasNote ? " ✓" : ""}{" "}
            <span className="font-normal text-muted-foreground/70">(tecla N)</span>
          </button>
          {notesOpen ? (
            <div className="mt-2 rounded-2xl border border-border bg-card p-4">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
                maxLength={NOTES_MAX}
                placeholder="Anotação livre sobre esta questão (ex.: armadilha, palavra nova)…"
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {noteDraft.length}/{NOTES_MAX}
                </span>
                <span className={cn(noteSaved && hasNote ? "text-success" : "")}>
                  {noteSaved ? (hasNote ? "✓ nota salva" : "") : "salvando…"}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {question.taskType !== "read_aloud" ? <SessionBanner qid={question.id} /> : null}
        {children}
      </main>

      {/* Barra de ação inferior */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 text-sm text-muted-foreground">{footerText}</div>
          <div className="flex shrink-0 items-center gap-2">{footerActions}</div>
        </div>
      </div>

      {showHelp ? <ShortcutsOverlay onClose={() => setShowHelp(false)} /> : null}
    </div>
  );
}
