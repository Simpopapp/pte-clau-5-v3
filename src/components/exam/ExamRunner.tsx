import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/TopNav";
import {
  getMeta,
  tokenize,
  type AnswerShortQuestion,
  type ChoiceQuestion,
  type DictationQuestion,
  type FibQuestion,
  type HiwQuestion,
  type ReadAloudQuestion,
  type ReadFibQuestion,
  type RepeatSentenceQuestion,
  type RetellLectureQuestion,
  type ReorderQuestion,
  type SstQuestion,
  type SummaryChoiceQuestion,
  type SwtQuestion,
  type UnifiedQuestion,
  type WriteEssayQuestion,
} from "@/lib/pte";
import {
  buildExamQueue,
  examLabel,
  examTiming,
  gradeExamSummary,
  type ExamId,
  type ExamResultRow,
} from "@/lib/pte/exam";
import { gradeDictation, gradeFib, gradeHiw, parseFibSegments } from "@/lib/pte/dictation";
import { gradeDropdown } from "@/lib/pte/fibDropdown";
import { gradeEssay } from "@/lib/pte/essay";
import { gradeReorder } from "@/lib/pte/reorder";
import { gradeMulti, gradeSingle } from "@/lib/pte/mcq";
import { gradeSst, gradeSwt } from "@/lib/pte/summary";
import { gradeAnswerShort, gradeRepeatSentence, gradeRetell } from "@/lib/pte/speaking";
import { addSessionRecord, recordAttempt, useAppState } from "@/lib/storage";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useSpeechSynthesis } from "@/lib/useSpeechSynthesis";
import { cn } from "@/lib/utils";

type SpeechQuestion =
  ReadAloudQuestion | RepeatSentenceQuestion | RetellLectureQuestion | AnswerShortQuestion;

interface ExamWidgetProps {
  /** Registra o submit da questão — o cronômetro chama ao zerar (auto-submit). */
  registerSubmit: (fn: () => void) => void;
  /** Conclui a questão com o score (null = não avaliável / pulada). */
  onDone: (score: number | null) => void;
}

/** Marca comum das tentativas de exame (fica fora da média de prática). */
const EXAM_TAG = "exam";

// ---------- Widget: Speaking (RA / RS / RL / ASQ) ----------

function SpeechWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: SpeechQuestion }) {
  const rec = useSpeechRecognition();
  const synth = useSpeechSynthesis();
  const [stage, setStage] = useState<"idle" | "record">("idle");
  const [played, setPlayed] = useState(false);
  const startedAtRef = useRef(0);
  const doneRef = useRef(false);

  const needsAudio = question.taskType !== "read_aloud";
  const audioText = question.audioText || question.transcript;
  const showPassage = question.taskType === "read_aloud";

  const play = () => {
    if (played) return;
    synth.speak(audioText, 1);
    setPlayed(true);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    rec.stop();
    const transcript = rec.getTranscript();
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    const pauses = rec.getStats().pauses;
    let score: number | null = null;
    if (transcript) {
      if (question.taskType === "retell_lecture") {
        score = gradeRetell(question.transcript, transcript, durationMs, pauses).score;
      } else if (question.taskType === "answer_short") {
        score = gradeAnswerShort(question.answer, transcript).score;
      } else {
        const reference =
          question.taskType === "repeat_sentence"
            ? question.answer || question.transcript
            : question.text;
        score = gradeRepeatSentence(reference, transcript, durationMs, pauses).score;
      }
    }
    recordAttempt({
      qid: question.id,
      taskType: question.taskType,
      mode: "speech",
      score,
      wpm: null,
      durationMs,
      tags: [EXAM_TAG],
    });
    onDone(score);
  }, [question, rec, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  const startRecording = () => {
    if (!rec.supported || doneRef.current) return;
    startedAtRef.current = Date.now();
    setStage("record");
    rec.start({ onSilence: () => submit() });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {showPassage ? (
        <p className="font-serif text-[15px] leading-relaxed text-foreground/90">{question.text}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {question.taskType === "retell_lecture"
            ? "Ouça a palestra e, depois, fale um resumo em voz alta."
            : question.taskType === "repeat_sentence"
              ? "Ouça a frase e repita exatamente o que ouviu."
              : "Ouça a pergunta e responda em uma ou duas palavras."}
        </p>
      )}

      {needsAudio ? (
        <Button
          variant="outline"
          className="mt-4"
          onClick={play}
          disabled={played || !synth.supported}
        >
          {played ? "Já reproduzida" : "Ouvir áudio"}
        </Button>
      ) : null}

      <div className="mt-5">
        {!rec.supported ? (
          <p className="text-sm text-warning">
            Reconhecimento de voz indisponível neste navegador — use “Pular questão”.
          </p>
        ) : stage === "idle" ? (
          <Button size="lg" onClick={startRecording}>
            Gravar resposta
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-destructive" />
            <span className="text-sm text-muted-foreground">Gravando — fale agora.</span>
            <Button size="lg" onClick={submit}>
              Concluir fala
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Widget: WFD (ditado) ----------

function DictationWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: DictationQuestion }) {
  const synth = useSpeechSynthesis();
  const [typed, setTyped] = useState("");
  const [played, setPlayed] = useState(false);
  const doneRef = useRef(false);

  const play = () => {
    if (played) return;
    synth.speak(question.audioText || question.answer, 1);
    setPlayed(true);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = gradeDictation(question.answer, typed);
    recordAttempt({
      qid: question.id,
      taskType: "wfd",
      mode: "manual",
      score: g.score,
      wpm: null,
      durationMs: 0,
      metrics: { hits: g.hits, missed: g.missed, extras: g.extras.length },
      tags: [EXAM_TAG],
    });
    onDone(g.score);
  }, [typed, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  const words = typed.trim() ? tokenize(typed).length : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <p className="text-sm text-muted-foreground">
        Ouça a frase (1 reprodução) e digite exatamente o que ouviu.
      </p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={play}
        disabled={played || !synth.supported}
      >
        {played ? "Já reproduzida" : "Ouvir frase"}
      </Button>
      <textarea
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        rows={4}
        placeholder="Digite a frase…"
        className="mt-4 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring"
      />
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{words} palavra(s)</p>
    </div>
  );
}

// ---------- Widget: resumos (SWT / SST / lst_summary) ----------

function SummaryWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: SwtQuestion | SstQuestion | SummaryChoiceQuestion }) {
  const isWritten = question.taskType === "swt";
  const synth = useSpeechSynthesis();
  const [typed, setTyped] = useState("");
  const [played, setPlayed] = useState(false);
  const doneRef = useRef(false);

  const play = () => {
    if (played) return;
    synth.speak(question.transcript || question.audioText, 1);
    setPlayed(true);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const grade = isWritten
      ? gradeSwt(question.text, typed)
      : gradeSst(question.transcript || question.audioText, typed);
    recordAttempt({
      qid: question.id,
      taskType: question.taskType,
      mode: "manual",
      score: grade.score,
      wpm: null,
      durationMs: 0,
      metrics: { words: grade.words, coverage: grade.coverage },
      tags: [EXAM_TAG],
    });
    onDone(grade.score);
  }, [isWritten, typed, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  const words = typed.trim() ? tokenize(typed).length : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {isWritten ? (
        <p className="font-serif text-[15px] leading-relaxed text-foreground/90">{question.text}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Ouça a palestra (1 reprodução) e escreva um resumo de 50–70 palavras.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={play}
            disabled={played || !synth.supported}
          >
            {played ? "Já reproduzida" : "Ouvir palestra"}
          </Button>
        </>
      )}
      <textarea
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        rows={6}
        placeholder="Escreva seu resumo…"
        className="mt-4 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-2 focus-visible:outline-ring"
      />
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{words} palavra(s)</p>
    </div>
  );
}

// ---------- Widget: FIB (lacunas inline) ----------

function FibWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: FibQuestion }) {
  const synth = useSpeechSynthesis();
  const [played, setPlayed] = useState(false);
  const segments = useMemo(() => parseFibSegments(question.text), [question.text]);
  const [inputs, setInputs] = useState<string[]>(() => question.answers.map(() => ""));
  const doneRef = useRef(false);

  const play = () => {
    if (played) return;
    synth.speak(question.audioText || question.transcript, 1);
    setPlayed(true);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = gradeFib(question.answers, inputs);
    recordAttempt({
      qid: question.id,
      taskType: "lst_fib",
      mode: "manual",
      score: g.score,
      wpm: null,
      durationMs: 0,
      metrics: { correct: g.correct, total: g.total },
      tags: [EXAM_TAG],
    });
    onDone(g.score);
  }, [inputs, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <p className="text-sm text-muted-foreground">Ouça o áudio e preencha as lacunas.</p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={play}
        disabled={played || !synth.supported}
      >
        {played ? "Já reproduzida" : "Ouvir áudio"}
      </Button>
      <p className="mt-5 font-serif text-[15px] leading-[2.4] text-foreground/90">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={`t-${i}`}>{seg.word} </span>
          ) : (
            <input
              key={`b-${seg.index}`}
              value={inputs[seg.index] ?? ""}
              onChange={(e) =>
                setInputs((prev) => prev.map((v, k) => (k === seg.index ? e.target.value : v)))
              }
              aria-label={`Lacuna ${seg.index + 1}`}
              className="mx-0.5 w-28 rounded-md border border-input bg-background px-2 py-0.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            />
          ),
        )}
      </p>
    </div>
  );
}

// ---------- Widget: HIW (palavras incorretas) ----------

function HiwWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: HiwQuestion }) {
  const synth = useSpeechSynthesis();
  const [played, setPlayed] = useState(false);
  const tokens = useMemo(() => tokenize(question.text), [question.text]);
  const [clicked, setClicked] = useState<number[]>([]);
  const doneRef = useRef(false);

  const play = () => {
    if (played) return;
    synth.speak(question.audioText || question.transcript, 1);
    setPlayed(true);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = gradeHiw(clicked, question.errorIndexes);
    recordAttempt({
      qid: question.id,
      taskType: "lst_hiw",
      mode: "manual",
      score: g.percent,
      wpm: null,
      durationMs: 0,
      metrics: { hits: g.hits, falsePositives: g.falsePositives },
      tags: [EXAM_TAG],
    });
    onDone(g.percent);
  }, [clicked, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <p className="text-sm text-muted-foreground">
        Ouça o áudio e clique nas palavras do texto que <strong>não</strong> aparecem nele.
      </p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={play}
        disabled={played || !synth.supported}
      >
        {played ? "Já reproduzida" : "Ouvir áudio"}
      </Button>
      <p className="mt-5 font-serif text-[15px] leading-[2.2] text-foreground/90">
        {tokens.map((w, i) => (
          <button
            key={`w-${i}`}
            type="button"
            onClick={() =>
              setClicked((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
            }
            className={cn(
              "mr-1 rounded px-0.5",
              clicked.includes(i) && "bg-destructive/15 text-destructive line-through",
            )}
          >
            {w}
          </button>
        ))}
      </p>
    </div>
  );
}

// ---------- Widget: MCQs (6 tipos de escolha) ----------

const AUDIO_CHOICE_TYPES = new Set(["lst_mcq", "lst_mcq_multi", "lst_hcs", "lst_smw"] as const);

function ChoiceWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: ChoiceQuestion }) {
  const isMulti = question.taskType === "mcq_multi" || question.taskType === "lst_mcq_multi";
  const hasAudio = AUDIO_CHOICE_TYPES.has(
    question.taskType as typeof AUDIO_CHOICE_TYPES extends Set<infer T> ? T : never,
  );
  const synth = useSpeechSynthesis();
  const [selected, setSelected] = useState<number[]>([]);
  const [played, setPlayed] = useState(false);
  const doneRef = useRef(false);

  const play = () => {
    if (played) return;
    synth.speak(question.audioText || question.transcript, 1);
    setPlayed(true);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = isMulti
      ? gradeMulti(selected, question.answer, question.options.length)
      : gradeSingle(selected[0] ?? null, question.answer);
    recordAttempt({
      qid: question.id,
      taskType: question.taskType,
      mode: "manual",
      score: g.score,
      wpm: null,
      durationMs: 0,
      metrics: { selected: selected.length, answers: question.answer.length },
      tags: [EXAM_TAG],
    });
    onDone(g.score);
  }, [isMulti, selected, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      if (!isMulti) return [i];
      return prev.includes(i) ? prev.filter((p) => p !== i) : [...prev, i];
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        {question.taskType === "lst_smw" ? (
          <p className="font-serif text-[15px] leading-relaxed text-foreground/90">
            {question.text}{" "}
            <span className="mx-0.5 inline-block w-24 border-b-2 border-dashed border-primary/60 align-baseline" />
          </p>
        ) : (
          <p className="font-serif text-[15px] leading-relaxed text-foreground/90">
            {question.text}
          </p>
        )}
        {hasAudio ? (
          <Button
            variant="outline"
            className="mt-4"
            onClick={play}
            disabled={played || !synth.supported}
          >
            {played ? "Já reproduzida" : "Ouvir gravação"}
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {isMulti ? "Marque todas as corretas (erro desconta)" : "Escolha uma"}
        </p>
        <div className="mt-3 space-y-2" role={isMulti ? "group" : "radiogroup"}>
          {question.options.map((opt, i) => (
            <button
              key={`opt-${i}`}
              type="button"
              role={isMulti ? "checkbox" : "radio"}
              aria-checked={selected.includes(i)}
              onClick={() => toggle(i)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                selected.includes(i)
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50",
              )}
            >
              <span className="mt-0.5 w-5 shrink-0 text-center text-xs">
                {selected.includes(i) ? (
                  <span className="text-primary">●</span>
                ) : (
                  <span className="text-muted-foreground/40">○</span>
                )}
              </span>
              <span className="shrink-0 font-serif font-semibold">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-foreground/90">{opt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Widgets: Write Essay / Re-order / Reading FIB (fase 5) ----------

function EssayExamWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: WriteEssayQuestion }) {
  const [typed, setTyped] = useState("");
  const doneRef = useRef(false);
  const words = typed.trim() ? typed.trim().split(/\s+/).length : 0;

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = gradeEssay(typed, question.sample);
    recordAttempt({
      qid: question.id,
      taskType: "write_essay",
      mode: "manual",
      score: g.score,
      wpm: null,
      durationMs: 0,
      metrics: { words: g.words, paragraphs: g.paragraphs },
      tags: [EXAM_TAG],
    });
    onDone(g.score);
  }, [typed, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <p className="text-sm text-muted-foreground">
        Escreva a redação completa: 200-300 palavras, 20 minutos no relógio do bloco.
      </p>
      <p className="mt-3 font-serif text-[15px] leading-relaxed">
        {question.prompt || question.text}
      </p>
      <textarea
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        rows={10}
        placeholder="Sua redação…"
        className="mt-4 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"
      />
      <p
        className={cn(
          "mt-2 text-xs tabular-nums",
          words >= 200 && words <= 300 ? "text-success" : "text-muted-foreground",
        )}
      >
        {words} / 200-300 palavras
      </p>
    </div>
  );
}

function ReorderExamWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: ReorderQuestion }) {
  const [order, setOrder] = useState<number[]>(() => question.items.map((_, i) => i));
  const doneRef = useRef(false);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const it = next.splice(from, 1)[0];
    if (it === undefined) return;
    next.splice(to, 0, it);
    setOrder(next);
  };

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = gradeReorder(order, question.correctOrder, question);
    recordAttempt({
      qid: question.id,
      taskType: "reorder_paragraphs",
      mode: "manual",
      score: g.score,
      wpm: null,
      durationMs: 0,
      metrics: { pairs: g.pairsCorrect, total: g.pairsTotal },
      tags: [EXAM_TAG],
    });
    onDone(g.score);
  }, [order, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <p className="text-sm text-muted-foreground">
        Reordene os trechos para formar um parágrafo coerente.
      </p>
      <ul className="mt-4 space-y-2">
        {order.map((itemIdx, pos) => (
          <li
            key={itemIdx}
            className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
          >
            <span className="mt-0.5 shrink-0 tabular-nums text-muted-foreground">{pos + 1}.</span>
            <span className="min-w-0 flex-1">{question.items[itemIdx]}</span>
            <span className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                aria-label="Mover para cima"
                className="rounded px-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-30"
                disabled={pos === 0}
                onClick={() => move(pos, pos - 1)}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                className="rounded px-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-30"
                disabled={pos === order.length - 1}
                onClick={() => move(pos, pos + 1)}
              >
                ▼
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FibDropdownExamWidget({
  question,
  registerSubmit,
  onDone,
}: ExamWidgetProps & { question: ReadFibQuestion }) {
  const [selections, setSelections] = useState<(string | null)[]>(() =>
    question.blanks.map(() => null),
  );
  const doneRef = useRef(false);

  const submit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const g = gradeDropdown(selections, question.blanks);
    recordAttempt({
      qid: question.id,
      taskType: "read_fib",
      mode: "manual",
      score: g.score,
      wpm: null,
      durationMs: 0,
      metrics: { correct: g.correct, total: g.total },
      tags: [EXAM_TAG],
    });
    onDone(g.score);
  }, [selections, question, onDone]);

  useEffect(() => {
    registerSubmit(submit);
  }, [registerSubmit, submit]);

  const parts = question.text.split(/_{5,}\((\d+)\)/);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    nodes.push(<span key={`t${i}`}>{parts[i]}</span>);
    if (i + 1 < parts.length) {
      const blankIdx = Number(parts[i + 1]) - 1;
      const blank = question.blanks[blankIdx];
      if (!blank) continue;
      nodes.push(
        <select
          key={`b${blankIdx}`}
          value={selections[blankIdx] ?? ""}
          onChange={(e) =>
            setSelections((prev) => {
              const next = [...prev];
              next[blankIdx] = e.target.value || null;
              return next;
            })
          }
          className="mx-1 rounded-lg border border-input bg-background px-2 py-0.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="" disabled>
            —
          </option>
          {blank.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>,
      );
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <p className="text-sm text-muted-foreground">Escolha a palavra correta para cada lacuna.</p>
      <p className="mt-4 font-serif text-[15px] leading-loose">{nodes}</p>
    </div>
  );
}

// ---------- Runner ----------

function widgetFor(question: UnifiedQuestion, props: ExamWidgetProps) {
  switch (question.taskType) {
    case "read_aloud":
    case "repeat_sentence":
    case "retell_lecture":
    case "answer_short":
      return <SpeechWidget key={question.id} question={question} {...props} />;
    case "wfd":
      return <DictationWidget key={question.id} question={question} {...props} />;
    case "swt":
    case "summarize_spoken_text":
    case "lst_summary":
      return <SummaryWidget key={question.id} question={question} {...props} />;
    case "lst_fib":
      return <FibWidget key={question.id} question={question} {...props} />;
    case "lst_hiw":
      return <HiwWidget key={question.id} question={question} {...props} />;
    case "write_essay":
      return <EssayExamWidget key={question.id} question={question} {...props} />;
    case "reorder_paragraphs":
      return <ReorderExamWidget key={question.id} question={question} {...props} />;
    case "read_fib":
      return <FibDropdownExamWidget key={question.id} question={question} {...props} />;
    default:
      return <ChoiceWidget key={question.id} question={question} {...props} />;
  }
}

const fmtClock = (s: number) =>
  `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export function ExamRunner({ examId, onExit }: { examId: ExamId; onExit: () => void }) {
  const app = useAppState();
  const navigate = useNavigate();
  const queue = useMemo(() => buildExamQueue(examId), [examId]);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<UnifiedQuestion | null>(null);
  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [phase, setPhase] = useState<"running" | "summary">("running");
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const m = getMeta(queue[0]);
    return m ? examTiming(m.taskType) : 60;
  });

  const submitRef = useRef<(() => void) | null>(null);
  const registerSubmit = useCallback((fn: () => void) => {
    submitRef.current = fn;
  }, []);
  const startedAt = useRef(Date.now());
  const handledRef = useRef(false);

  // Carrega a questão atual (import dinâmico por task type).
  useEffect(() => {
    let alive = true;
    const qid = queue[index];
    if (!qid) return;
    setQuestion(null);
    import("@/lib/pte").then(({ loadQuestion }) =>
      loadQuestion(qid).then((q) => {
        if (alive) setQuestion(q ?? null);
      }),
    );
    return () => {
      alive = false;
    };
  }, [index, queue]);

  // Reinicia o cronômetro a cada questão nova.
  useEffect(() => {
    if (!question) return;
    handledRef.current = false;
    setSecondsLeft(examTiming(question.taskType));
  }, [question]);

  // Contagem regressiva (para em 0).
  useEffect(() => {
    if (phase !== "running" || !question) return;
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [question, phase]);

  // Auto-submit ao zerar.
  useEffect(() => {
    if (phase !== "running" || secondsLeft > 0) return;
    submitRef.current?.();
  }, [secondsLeft, phase]);

  const handleDone = useCallback(
    (score: number | null) => {
      if (handledRef.current) return;
      handledRef.current = true;
      const qid = queue[index]!;
      const nextResults: ExamResultRow[] = [...results, { qid, score }];
      setResults(nextResults);
      if (index + 1 >= queue.length) {
        addSessionRecord({
          startedAt: startedAt.current,
          finishedAt: Date.now(),
          kind: "exam",
          label: examLabel(examId),
          results: nextResults.map((r) => ({ qid: r.qid, score: r.score, wpm: null })),
        });
        setPhase("summary");
      } else {
        setIndex(index + 1);
      }
    },
    [examId, index, queue, results],
  );

  if (phase === "summary") {
    const summary = gradeExamSummary(results, app.attempts);
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-16 pt-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              {examLabel(examId)} · concluído
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
              {summary.overall !== null ? `${summary.overall}% de média` : "Sem scores avaliáveis"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.gradedCount} de {summary.totalCount} questão(ões) com correção automática.
            </p>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-muted-foreground">Média por seção</h2>
            <div className="mt-4 space-y-2">
              {summary.bySection.map((s) => (
                <div key={s.section} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{s.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        s.avg === null
                          ? "bg-muted-foreground/30"
                          : s.avg >= 90
                            ? "bg-success"
                            : s.avg >= 70
                              ? "bg-warning"
                              : "bg-destructive",
                      )}
                      style={{ width: `${s.avg ?? 0}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums">
                    {s.avg !== null ? `${s.avg}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {summary.byType.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-muted-foreground">
                Por task type (vs. prática livre)
              </h2>
              <ul className="mt-3 divide-y divide-border/50 text-sm">
                {summary.byType.map((t) => (
                  <li key={t.taskType} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{t.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t.avg !== null ? `${t.avg}%` : "—"}
                      {t.practiceAvg !== null ? (
                        <span
                          className={cn(
                            "ml-2",
                            t.avg !== null && t.avg >= t.practiceAvg
                              ? "text-success"
                              : "text-destructive",
                          )}
                        >
                          {t.avg !== null && t.avg >= t.practiceAvg ? "▲" : "▼"} {t.practiceAvg}%
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.weakest.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-muted-foreground">Pontos fracos</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.weakest.map((t) => (
                  <span
                    key={t.taskType}
                    className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs"
                  >
                    {t.label} · {t.avg}%
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={onExit}>
              Fazer outro simulado
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate({ to: "/" })}>
              Voltar ao início
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const total = queue.length;
  const current = index + 1;
  const urgent = secondsLeft <= 10;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl px-4 pb-44">
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-serif text-base font-semibold text-foreground">
              {examLabel(examId)} · Questão {current} / {total}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5">
              modo simulado — sem correção imediata
            </span>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 font-mono text-sm tabular-nums",
              urgent ? "bg-destructive/10 font-semibold text-destructive" : "bg-secondary",
            )}
            aria-label="Tempo restante desta questão"
          >
            {fmtClock(secondsLeft)}
          </span>
        </div>

        {question ? (
          widgetFor(question, { registerSubmit, onDone: handleDone })
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"
          >
            Carregando questão… (o cronômetro começa quando ela abre)
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="text-sm text-muted-foreground">
            Ao zerar o tempo, a questão é enviada automaticamente.
          </div>
          <Button variant="ghost" onClick={() => handleDone(null)}>
            Pular questão
          </Button>
        </div>
      </div>
    </div>
  );
}
