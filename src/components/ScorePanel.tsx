import type { GradeResult } from "@/lib/scoring";
import { paceLabel } from "@/lib/scoring";
import { cn } from "@/lib/utils";

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ScorePanel({ grade }: { grade: GradeResult }) {
  const scoreTone =
    grade.score >= 90 ? "text-success" : grade.score >= 70 ? "text-warning" : "text-destructive";
  const paceTone = grade.paceVerdict === "ideal" ? "text-success" : "text-warning";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn("font-serif text-3xl font-semibold", scoreTone)}>{grade.score}%</div>
          <div className="mt-1 text-xs text-muted-foreground">
            conteúdo · {grade.hits}/{grade.total} palavras
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn("font-serif text-3xl font-semibold", paceTone)}>{grade.wpm}</div>
          <div className="mt-1 text-xs text-muted-foreground">palavras/min</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="font-serif text-3xl font-semibold">
            {formatDuration(grade.durationMs)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">duração</div>
        </div>
      </div>

      <p className={cn("text-sm font-medium", paceTone)}>{paceLabel(grade.paceVerdict)}</p>

      <p className="text-xs text-muted-foreground">
        pausas longas: {grade.pauses} · repetições: {grade.repetitions}
        {grade.moved > 0 ? ` · fora de ordem: ${grade.moved}` : ""}
      </p>

      {grade.mastered ? (
        <p className="text-sm font-medium text-success">
          Dominada — conteúdo e ritmo na faixa ideal do PTE.
        </p>
      ) : null}

      {grade.moved > 0 ? (
        <p className="text-xs text-muted-foreground">
          Palavras <span className="text-info underline decoration-dotted">pontilhadas</span>{" "}
          estavam certas, mas fora de ordem — vale crédito parcial. Atenção à sequência das ideias.
        </p>
      ) : null}

      {grade.extras.length > 0 ? (
        <div className="text-sm">
          <span className="text-muted-foreground">Palavras fora do passage: </span>
          <span className="text-info">{grade.extras.slice(0, 12).join(", ")}</span>
        </div>
      ) : null}

      {grade.transcript ? (
        <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            O que captamos
          </p>
          <p className="mt-2 text-sm italic leading-relaxed text-foreground/85">
            {grade.transcript}
          </p>
        </div>
      ) : null}
    </div>
  );
}
