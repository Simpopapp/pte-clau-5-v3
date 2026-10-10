import { TopNav } from "@/components/TopNav";
import { TYPE_META, type UnifiedQuestion } from "@/lib/pte";

/** Placeholder para tipos ainda sem motor implementado. */
export function SoonPractice({ question }: { question: UnifiedQuestion }) {
  const meta = TYPE_META[question.taskType];
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
            {meta.label}
          </span>
          <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight">
            Este tipo de prática chega em breve
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Estamos construindo o motor desta seção. Enquanto isso, a pergunta é exibida abaixo para
            estudo livre.
          </p>
          <p className="mt-6 text-left font-serif text-[15px] leading-relaxed text-foreground/90">
            {question.text}
          </p>
          <a
            href={`/${meta.section}`}
            className="mt-6 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar à seção
          </a>
        </div>
      </main>
    </div>
  );
}
