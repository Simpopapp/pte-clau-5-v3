import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import {
  exportBackup,
  importBackup,
  updateSettings,
  useAppState,
  ACCENT_OPTIONS,
  type Accent,
} from "@/lib/storage";
import { countdownLabel, daysUntil } from "@/lib/pte/goal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Ajustes — PTE Master Hub" },
      {
        name: "description",
        content:
          "Prepare seu treino: tempo de preparação, meta diária, velocidade do modelo, sotaque e backup.",
      },
      { property: "og:title", content: "Ajustes — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Tempo de preparação, meta diária, sotaque do reconhecimento e backup do progresso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const prepOptions = [
  { value: 20, label: "20 s" },
  { value: 30, label: "30 s" },
  { value: 40, label: "40 s (padrão PTE)" },
  { value: 0, label: "Sem contagem" },
];

const goalOptions = [5, 10, 15, 20];
const rateOptions = [
  { value: 1, label: "1.0× (normal)" },
  { value: 0.8, label: "0.8× (mais lento)" },
];
const targetOptions = [
  { value: 50, label: "50 — universidades" },
  { value: 58, label: "58 — trabalho/vistos" },
  { value: 65, label: "65 — imigração AU/UK" },
  { value: 79, label: "79 — pontuação máxima" },
];

function OptionGroup<T extends number | string>({
  title,
  description,
  options,
  current,
  onSelect,
}: {
  title: string;
  description: string;
  options: { value: T; label: string }[];
  current: T;
  onSelect: (value: T) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onSelect(o.value)}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors",
              current === o.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function SettingsPage() {
  const app = useAppState();
  const s = app.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const exportar = () => {
    try {
      const blob = new Blob([exportBackup()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pte-master-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg("Backup exportado — guarde o arquivo baixado.");
    } catch {
      setBackupMsg("Não foi possível exportar agora.");
    }
  };

  const importar = async (file: File) => {
    try {
      const text = await file.text();
      const result = importBackup(text);
      setBackupMsg(
        result.ok ? "Progresso restaurado com sucesso." : `Arquivo inválido: ${result.error}`,
      );
    } catch {
      setBackupMsg("Não foi possível ler o arquivo.");
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Ajustes</h1>

        <OptionGroup
          title="Preparação"
          description="Tempo para ler o passage mentalmente antes de gravar (o PTE dá 40 s)."
          options={prepOptions}
          current={s.prepSeconds}
          onSelect={(v) => updateSettings({ prepSeconds: v })}
        />
        <OptionGroup
          title="Meta diária"
          description="Quantas questões diferentes você quer ler por dia."
          options={goalOptions.map((g) => ({ value: g, label: `${g} questões` }))}
          current={s.dailyGoal}
          onSelect={(v) => updateSettings({ dailyGoal: v })}
        />
        <OptionGroup
          title="Velocidade do modelo"
          description="Velocidade padrão ao ouvir o passage lido pela voz do navegador."
          options={rateOptions}
          current={s.modelRate}
          onSelect={(v) => updateSettings({ modelRate: v })}
        />
        <OptionGroup<Accent>
          title="Sotaque do reconhecimento"
          description="Sotaque usado para transcrever sua leitura. O PTE usa inglês australiano."
          options={ACCENT_OPTIONS}
          current={s.accent}
          onSelect={(v) => updateSettings({ accent: v })}
        />

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Prova</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua meta: data da prova e pontuação-alvo. O app usa isso para mostrar a contagem
            regressiva e medir sua prontidão — nada sai daqui do navegador.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="exam-date"
                className="mb-1.5 block text-sm font-medium text-foreground/90"
              >
                Data da prova
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="exam-date"
                  type="date"
                  value={s.examDate ?? ""}
                  onChange={(e) => updateSettings({ examDate: e.target.value || null })}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                {s.examDate ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateSettings({ examDate: null })}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
              {s.examDate ? (
                <p className="mt-2 text-sm text-primary">{countdownLabel(daysUntil(s.examDate))}</p>
              ) : null}
            </div>
            <OptionGroup
              title="Pontuação-alvo"
              description="Sua meta de score no PTE (escala 10–90)."
              options={targetOptions}
              current={s.targetScore}
              onSelect={(v) => updateSettings({ targetScore: v })}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Backup do progresso</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Seu histórico vive só neste navegador. Exporte um arquivo JSON para guardar ou levar
            para outro dispositivo — e importe de volta quando quiser.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportar}>
              Exportar backup
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Importar backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importar(file);
                e.target.value = "";
              }}
            />
          </div>
          {backupMsg ? <p className="mt-3 text-sm text-foreground/85">{backupMsg}</p> : null}
        </section>

        <p className="text-xs text-muted-foreground">
          Tudo é salvo automaticamente neste navegador. Nenhuma conta, nenhum servidor.
        </p>
      </main>
    </div>
  );
}
