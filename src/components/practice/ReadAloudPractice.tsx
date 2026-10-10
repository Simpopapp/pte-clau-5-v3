import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PassageText } from "@/components/PassageText";
import { ProgressRing } from "@/components/ProgressRing";
import { ScorePanel } from "@/components/ScorePanel";
import { TopNav } from "@/components/TopNav";

import { Button } from "@/components/ui/button";
import {
  nextIdInType,
  positionInType,
  prevIdInType,
  tokenize,
  type ReadAloudQuestion,
} from "@/lib/pte";
import { gradePassage, type GradeResult, type WordMark, type WordStatus } from "@/lib/scoring";
import { completeSessionItem, sessionFinished, sessionNextId, useSession } from "@/lib/session";
import { speakingTags } from "@/lib/pte/diagnostics";
import { recordAttempt, toggleBookmark, useAppState } from "@/lib/storage";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useSpeechSynthesis } from "@/lib/useSpeechSynthesis";
import { cn } from "@/lib/utils";

type Phase = "idle" | "prep" | "recording" | "analyzing" | "result";

const MAX_RECORD_MS = 40000;

/** Motor de Read Aloud (a questão chega carregada pela rota /practice). */
export function ReadAloudPractice({ question: loaded }: { question: ReadAloudQuestion }) {
  const question = useMemo(() => ({ ...loaded, words: tokenize(loaded.text) }), [loaded]);
  const navigate = useNavigate();
  const app = useAppState();
  const settings = app.settings;
  const session = useSession();

  const [phase, setPhase] = useState<Phase>("idle");
  const [prepLeft, setPrepLeft] = useState(settings.prepSeconds);
  const [elapsed, setElapsed] = useState(0);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [modelRate, setModelRate] = useState(settings.modelRate);
  const [shortPrep, setShortPrep] = useState(false);
  const [notGradable, setNotGradable] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualMissed, setManualMissed] = useState<ReadonlySet<number>>(new Set());
  const [manualScore, setManualScore] = useState<number | null>(null);

  const recognition = useSpeechRecognition();
  const synth = useSpeechSynthesis();

  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const startedAtRef = useRef(0);
  const recordedRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const { number, total: poolTotal } = positionInType(question.id);

  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setGrade(null);
    setElapsed(0);
    setPrepLeft(settings.prepSeconds);
    setShortPrep(false);
    setNotGradable(false);
    setManualMode(false);
    setManualMissed(new Set());
    setManualScore(null);
    recordedRef.current = false;
    synth.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, settings.prepSeconds]);

  useEffect(() => {
    resetToIdle();
  }, [resetToIdle]);

  const beginRecording = useCallback(() => {
    setPhase("recording");
    startedAtRef.current = Date.now();
    setElapsed(0);
    if (recognition.supported) {
      recognition.start({ onSilence: () => finishRef.current(), lang: settings.accent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognition.supported, settings.accent]);

  const finish = useCallback(() => {
    if (phaseRef.current !== "recording") return;
    recognition.stop();
    setPhase("analyzing");
    window.setTimeout(() => {
      const duration = Date.now() - startedAtRef.current;
      const micDenied = recognition.error === "not-allowed" || recognition.error === "network";
      if (!question) return;
      if (micDenied) {
        setGrade(null);
        setPhase("result");
        return;
      }
      if (recognition.supported) {
        const transcript = recognition.getTranscript();
        const g = gradePassage(question.words, transcript, duration, {
          pauses: recognition.getStats().pauses,
        });
        if (!g.gradable) {
          // transcrição curta demais: não registra 0% injusto
          setGrade(null);
          setNotGradable(true);
          setPhase("result");
          return;
        }
        setGrade(g);
        if (!recordedRef.current) {
          recordAttempt({
            qid: question.id,
            mode: "speech",
            contentScore: g.score,
            wpm: g.wpm,
            durationMs: duration,
            metrics: { hits: g.hits, missed: g.total - g.hits, total: g.total },
            tags: speakingTags(g.score, { hits: g.hits, total: g.total }, g.wpm),
          });
          recordedRef.current = true;
        }
        if (sessionRef.current.active && sessionNextId() === question.id) {
          completeSessionItem({ qid: question.id, score: g.score, wpm: g.wpm });
        }
      } else {
        setGrade(null);
        if (!recordedRef.current) {
          recordAttempt({
            qid: question.id,
            mode: "manual",
            contentScore: null,
            wpm: null,
            durationMs: duration,
          });
          recordedRef.current = true;
        }
      }
      setPhase("result");
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, recognition]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  // contagem de preparação
  useEffect(() => {
    if (phase !== "prep") return;
    const total = shortPrep ? 3 : settings.prepSeconds;
    if (total === 0) {
      beginRecording();
      return;
    }
    if (prepLeft <= 0) {
      beginRecording();
      return;
    }
    const t = window.setTimeout(() => setPrepLeft((p) => p - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, prepLeft, shortPrep, settings.prepSeconds, beginRecording]);

  // cronômetro da gravação + limite máximo
  useEffect(() => {
    if (phase !== "recording") return;
    const iv = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
    return () => window.clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase === "recording" && elapsed >= MAX_RECORD_MS) finishRef.current();
  }, [phase, elapsed]);

  const micDenied = recognition.error === "not-allowed" || recognition.error === "network";

  const goNext = useCallback(() => {
    if (sessionRef.current.active) {
      if (sessionFinished()) {
        navigate({ to: "/session", search: { done: true } });
        return;
      }
      const nid = sessionNextId();
      if (nid) {
        navigate({ to: "/practice", search: { q: nid } });
        return;
      }
    }
    navigate({ to: "/practice", search: { q: nextIdInType(question.id) ?? question.id } });
  }, [question, navigate]);

  const bookmarked = app.bookmarks.includes(question.id);
  const prepTotal = shortPrep ? 3 : settings.prepSeconds;

  const startPrep = () => {
    setGrade(null);
    setElapsed(0);
    setPrepLeft(shortPrep ? 3 : settings.prepSeconds);
    setNotGradable(false);
    setManualMode(false);
    setManualMissed(new Set());
    setManualScore(null);
    setPhase("prep");
    recognition.clearError();
  };

  const toggleManualWord = (i: number) => {
    setManualMissed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const registerManualScore = () => {
    const total = question.words.length;
    const score = Math.round(((total - manualMissed.size) / total) * 100);
    const hits = total - manualMissed.size;
    recordAttempt({
      qid: question.id,
      mode: "manual",
      contentScore: score,
      wpm: null,
      durationMs: 0,
      metrics: { hits, missed: manualMissed.size, total },
      tags: score <= 70 ? ["conteudo"] : [],
    });
    if (sessionRef.current.active && sessionNextId() === question.id) {
      completeSessionItem({ qid: question.id, score, wpm: null });
    }
    setManualScore(score);
    setManualMode(false);
  };

  const manualMarks: WordMark[] | undefined = manualMode
    ? question.words.map((word, i) => ({
        word,
        status: (manualMissed.has(i) ? "missed" : "hit") as WordStatus,
      }))
    : undefined;

  const sessionProgress = session.active
    ? Math.round((session.index / Math.max(session.size, 1)) * 100)
    : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-44">
        {/* Cabeçalho da questão */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-serif text-base font-semibold text-foreground">
              Questão {number} <span className="text-muted-foreground">/ {poolTotal}</span>
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5">{question.topic}</span>
            <span>{question.wordCount} palavras</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Marcar como difícil"
              className={cn("text-base", bookmarked ? "text-primary" : "text-muted-foreground")}
              onClick={() => toggleBookmark(question.id)}
            >
              ★
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/practice",
                  search: { q: prevIdInType(question.id) ?? question.id },
                })
              }
            >
              ← Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/practice",
                  search: { q: nextIdInType(question.id) ?? question.id },
                })
              }
            >
              Próxima →
            </Button>
          </div>
        </div>

        {/* Progresso da sessão */}
        {session.active ? (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Sessão · {session.index} de {session.size}
              </span>
              <span className="tabular-nums">{sessionProgress}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${sessionProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Passage */}
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <PassageText
            words={question.words}
            marks={manualMarks ?? (phase === "result" && grade ? grade.marks : undefined)}
            onWordClick={manualMode ? toggleManualWord : undefined}
          />
        </div>

        {/* Resultado / instruções */}
        <div className="mt-6 space-y-4">
          {phase === "result" && micDenied ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <p className="font-medium">Precisamos do microfone para corrigir sua leitura.</p>
              <p className="mt-1 text-muted-foreground">
                Libere o acesso no ícone de cadeado da barra de endereço e tente de novo.
              </p>
              <Button size="sm" className="mt-3" onClick={startPrep}>
                Tentar de novo
              </Button>
            </div>
          ) : null}
          {phase === "result" && grade ? <ScorePanel grade={grade} /> : null}
          {phase === "result" && notGradable && !manualMode ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium">Não foi possível avaliar esta leitura.</p>
              <p className="mt-1 text-muted-foreground">
                A transcrição ficou curta demais — fale mais perto do microfone e tente de novo, ou
                marque os erros você mesmo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={startPrep}>
                  Tentar de novo
                </Button>
                <Button size="sm" variant="outline" onClick={() => setManualMode(true)}>
                  Marcar erros manualmente
                </Button>
              </div>
            </div>
          ) : null}
          {manualMode ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium">Toque nas palavras que você errou.</p>
              <p className="mt-1 text-muted-foreground">
                Score previsto:{" "}
                <span className="font-medium text-foreground">
                  {Math.round(
                    ((question.words.length - manualMissed.size) / question.words.length) * 100,
                  )}
                  %
                </span>{" "}
                · {manualMissed.size} palavra{manualMissed.size === 1 ? "" : "s"} marcada
                {manualMissed.size === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={registerManualScore} disabled={manualScore !== null}>
                  Registrar score manual
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setManualMode(false)}>
                  Cancelar
                </Button>
              </div>
              {manualScore !== null ? (
                <p className="mt-3 text-sm font-medium text-success">
                  Score manual registrado: {manualScore}%.
                </p>
              ) : null}
            </div>
          ) : null}
          {phase === "result" && !grade && !notGradable && !micDenied && !manualMode ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Leitura registrada
              {recognition.supported ? "" : " (este navegador não corrige automaticamente)"}. Ouça o
              modelo e compare a entonação — ou tente de novo.
            </div>
          ) : null}
          {(phase === "idle" || phase === "prep") && question.prompt ? (
            <p className="text-sm italic text-muted-foreground">{question.prompt}</p>
          ) : null}
        </div>
      </main>

      {/* Barra de ação inferior */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 text-sm text-muted-foreground">
            {phase === "idle" && "Preparado? Leia com ritmo natural e articulação clara."}
            {phase === "prep" && "Preparação — leia mentalmente e organize a entonação."}
            {phase === "recording" && (
              <span className="flex items-center gap-2">
                <span className="rec-pulse inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
                Gravando… {(elapsed / 1000).toFixed(1)}s
              </span>
            )}
            {phase === "analyzing" && "Analisando sua leitura…"}
            {phase === "result" && "Revise as palavras destacadas no passage."}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(phase === "idle" || phase === "result") && (
              <Button
                variant="outline"
                onClick={() =>
                  synth.speaking ? synth.cancel() : synth.speak(question.text, modelRate)
                }
              >
                {synth.speaking ? "Parar modelo" : "Ouvir modelo"}
              </Button>
            )}
            {synth.supported && (phase === "idle" || phase === "result") ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModelRate((r) => (r === 1 ? 0.8 : 1))}
                aria-label="Alternar velocidade do modelo"
              >
                {modelRate}×
              </Button>
            ) : null}

            {phase === "idle" && (
              <Button size="lg" onClick={startPrep}>
                Iniciar preparação
              </Button>
            )}

            {phase === "prep" && (
              <>
                <ProgressRing value={prepTotal > 0 ? 1 - prepLeft / prepTotal : 1} size={56}>
                  <span className="font-serif text-lg font-semibold tabular-nums">
                    {prepTotal === 0 ? "—" : Math.max(0, prepLeft)}
                  </span>
                </ProgressRing>
                <Button size="lg" onClick={beginRecording}>
                  Começar agora
                </Button>
              </>
            )}

            {phase === "recording" && (
              <Button size="lg" variant="destructive" onClick={() => finishRef.current()}>
                {recognition.supported ? "Parar e corrigir" : "Concluir leitura"}
              </Button>
            )}

            {phase === "analyzing" && (
              <Button size="lg" disabled>
                Analisando…
              </Button>
            )}

            {phase === "result" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShortPrep(true);
                    setPrepLeft(3);
                    setGrade(null);
                    setElapsed(0);
                    setNotGradable(false);
                    setPhase("prep");
                  }}
                >
                  Tentar de novo
                </Button>
                <Button size="lg" onClick={goNext}>
                  {session.active ? "Próxima da sessão" : "Próxima questão"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
