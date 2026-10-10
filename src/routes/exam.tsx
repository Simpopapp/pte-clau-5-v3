import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ExamRunner } from "@/components/exam/ExamRunner";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { SECTION_META, SECTION_ORDER } from "@/lib/pte";
import { estimateSeconds, examQuestionCount, type ExamId } from "@/lib/pte/exam";

export const Route = createFileRoute("/exam")({
  head: () => ({
    meta: [
      { title: "Simulado — PTE Master Hub" },
      {
        name: "description",
        content:
          "Simulado cronometrado do PTE por seção ou completo, com tempos oficiais, auto-submit e resumo comparativo com sua prática.",
      },
      { property: "og:title", content: "Simulado — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Simulado cronometrado do PTE por seção ou completo, com tempos oficiais e resumo comparativo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExamPage,
});

function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `~${m} min`;
  return `~${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
}

function ExamPage() {
  const [examId, setExamId] = useState<ExamId | null>(null);
  if (!examId) return <ChoiceScreen onStart={setExamId} />;
  return <ExamRunner key={examId} examId={examId} onExit={() => setExamId(null)} />;
}

function ChoiceScreen({ onStart }: { onStart: (id: ExamId) => void }) {
  const options: { id: ExamId; label: string; description: string }[] = [
    ...SECTION_ORDER.map((s) => ({
      id: s as ExamId,
      label: SECTION_META[s]!.label,
      description: SECTION_META[s]!.description,
    })),
    {
      id: "full",
      label: "Simulado completo",
      description: "As quatro seções em sequência, como no exame real.",
    },
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Simulado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Questões sorteadas com os tempos oficiais do exame. Ao zerar o cronômetro de cada
            questão, a resposta é enviada — sem correção imediata. No fim, você compara com sua
            prática livre.
          </p>
        </div>

        <div className="grid gap-3">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStart(opt.id)}
              className="group rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-serif text-lg font-semibold">{opt.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {examQuestionCount(opt.id)} questões · {fmtDuration(estimateSeconds(opt.id))}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          As tentativas do simulado alimentam sua agenda de revisão, mas ficam marcadas como exame e
          não entram na sua média de prática.
        </p>

        <Button variant="ghost" onClick={() => history.back()}>
          Voltar
        </Button>
      </main>
    </div>
  );
}
