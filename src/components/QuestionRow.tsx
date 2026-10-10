import { Link } from "@tanstack/react-router";

import { TYPE_META, type QuestionMeta } from "@/lib/pte";
import { isMasteredStat, type QuestionStat } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface QuestionRowProps {
  meta: QuestionMeta;
  number: number;
  /** Texto de pré-visualização (só para task types em que o texto não é a resposta). */
  preview?: string | undefined;
  stat: QuestionStat | undefined;
  bookmarked: boolean;
  onToggleBookmark: (qid: string) => void;
  now?: number;
}

const DIFFICULTY_LABEL = { easy: "fácil", medium: "média", hard: "difícil" } as const;

function statusOf(
  stat: QuestionStat | undefined,
  taskType: QuestionMeta["taskType"],
  now: number,
): { label: string; dot: string } {
  if (!stat || stat.attempts === 0) return { label: "não tentada", dot: "bg-muted-foreground/40" };
  if (isMasteredStat(stat, taskType)) {
    return {
      label: `dominada · ${stat.bestContent}%`,
      dot: "bg-success",
    };
  }
  const due = stat.dueAt <= now ? " · revisar" : "";
  if (taskType === "read_aloud" && (stat.bestContent ?? 0) >= 90) {
    return { label: `conteúdo ok · ritmo a ajustar${due}`, dot: "bg-warning" };
  }
  return {
    label: `melhor ${stat.bestContent}%${due}`,
    dot: (stat.lastScore ?? 0) >= 70 ? "bg-warning" : "bg-destructive",
  };
}

export function QuestionRow({
  meta,
  number,
  preview,
  stat,
  bookmarked,
  onToggleBookmark,
  now = Date.now(),
}: QuestionRowProps) {
  const status = statusOf(stat, meta.taskType, now);
  const title = preview ?? `${TYPE_META[meta.taskType].label} · ${meta.topic}`;
  const ready = TYPE_META[meta.taskType].ready;
  const body = (
    <>
      <p
        className={cn(
          "truncate leading-snug text-foreground/90 group-hover:text-foreground",
          preview ? "font-serif text-[15px]" : "text-sm font-medium",
        )}
      >
        {title}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-secondary px-2 py-0.5">
          {preview ? meta.topic : TYPE_META[meta.taskType].label}
        </span>
        <span>{meta.wordCount} palavras</span>
        {meta.difficulty ? <span>· {DIFFICULTY_LABEL[meta.difficulty]}</span> : null}
        <span>· {status.label}</span>
        {!ready ? (
          <span className="rounded-full bg-secondary/60 px-2 py-0.5 uppercase tracking-wider">
            em breve
          </span>
        ) : null}
      </p>
    </>
  );
  return (
    <div className="group flex items-start gap-3 border-b border-border/50 px-3 py-3 transition-colors last:border-0 hover:bg-secondary/40">
      <span className="w-10 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">
        {String(number).padStart(3, "0")}
      </span>
      <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", status.dot)} title={status.label} />
      {ready ? (
        <Link to="/practice" search={{ q: meta.id }} className="min-w-0 flex-1">
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      <button
        type="button"
        aria-label={bookmarked ? "Remover das difíceis" : "Marcar como difícil"}
        aria-pressed={bookmarked}
        onClick={() => onToggleBookmark(meta.id)}
        className={cn(
          "mt-1 shrink-0 rounded-md px-2 py-1 text-base leading-none transition-colors hover:bg-secondary",
          bookmarked ? "text-primary" : "text-muted-foreground/40",
        )}
      >
        ★
      </button>
    </div>
  );
}
