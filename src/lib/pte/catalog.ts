// Catálogo de conteúdo: carrega SOB DEMANDA (import dinâmico por task type) e normaliza as questões.
// Para contagens, listas e navegação use `manifest.ts` — ele é leve e síncrono.

import { getMeta } from "./manifest";
import {
  SECTION_META,
  SECTION_ORDER,
  TYPE_META,
  tokenize,
  type Difficulty,
  type Question,
  type Section,
  type TaskType,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function rawList(mod: unknown): Raw[] {
  const m = mod as { questions?: Raw[] } | Raw[];
  const list = Array.isArray(m) ? m : (m.questions ?? []);
  return list as Raw[];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeAnswers(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Number(n)).filter((n) => Number.isInteger(n));
  if (typeof raw === "number" && Number.isInteger(raw)) return [raw];
  if (typeof raw === "string") {
    const parsed = raw
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n));
    return parsed;
  }
  return [];
}

/** `answer` pode vir como string JSON (ex.: '["a", "b"]') ou array — normaliza para string[]. */
function parseArrayAnswer(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((a) => str(a)).filter(Boolean);
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((a) => str(a)).filter(Boolean);
    } catch {
      /* cai no fallback */
    }
  }
  return [];
}

function baseOf(
  q: Raw,
  taskType: TaskType,
): {
  id: string;
  section: Section;
  prompt: string;
  text: string;
  audioText: string;
  transcript: string;
  wordCount: number;
  topic: string;
  source: string;
  difficulty?: Difficulty;
  examFrequency?: number;
} {
  const rawText = str(q["text"]) || str(q["content"]);
  const text = taskType === "read_aloud" ? rawText.replace(/\s+/g, " ").trim() : rawText;
  const difficulty = ["easy", "medium", "hard"].includes(str(q["difficulty"]))
    ? (str(q["difficulty"]) as Difficulty)
    : undefined;
  const freq = num(q["exam_frequency"]);
  return {
    id: str(q["id"]),
    section: TYPE_META[taskType].section,
    prompt: str(q["prompt"]),
    text,
    audioText: str(q["audio_text"]),
    transcript: str(q["transcript"]) || str(q["audio_text"]),
    wordCount: num(q["word_count"]) ?? tokenize(text).length,
    topic: str(q["topic"]) || "sem tópico",
    source: str(q["source"]),
    ...(difficulty ? { difficulty } : {}),
    ...(freq !== null ? { examFrequency: freq } : {}),
  };
}

type ChoiceTaskType = Extract<
  Question,
  { taskType: "mcq_single" | "mcq_multi" | "lst_mcq" | "lst_mcq_multi" | "lst_hcs" | "lst_smw" }
>["taskType"];

function build(taskType: TaskType, json: unknown): Question[] {
  const out: Question[] = [];
  for (const q of rawList(json)) {
    const base = baseOf(q, taskType);
    switch (taskType) {
      case "read_aloud":
      case "retell_lecture":
        out.push({ ...base, taskType, gradingNotes: str(q["grading_notes"]) });
        break;
      case "repeat_sentence":
        out.push({
          ...base,
          taskType,
          answer: str(q["answer"]) || str(q["transcript"]),
          gradingNotes: str(q["grading_notes"]),
        });
        break;
      case "answer_short":
        out.push({
          ...base,
          taskType,
          answer: str(q["answer"]),
          gradingNotes: str(q["grading_notes"]),
        });
        break;
      case "swt":
      case "summarize_spoken_text":
      case "lst_summary":
        out.push({
          ...base,
          taskType,
          gradingNotes: str(q["grading_notes"]),
          sample: str(q["sample"]),
        });
        break;
      case "write_essay":
        out.push({
          ...base,
          taskType,
          gradingNotes: str(q["grading_notes"]),
          sample: str(q["sample"]),
          essayType: str(q["essay_type"]),
          vocabulary: Array.isArray(q["vocabulary"])
            ? q["vocabulary"].map((v: unknown) => str(v)).filter(Boolean)
            : [],
        });
        break;
      case "reorder_paragraphs":
        out.push({
          ...base,
          taskType,
          items: Array.isArray(q["items"]) ? q["items"].map((s: unknown) => str(s)) : [],
          correctOrder: normalizeAnswers(q["correct_order"]),
        });
        break;
      case "read_fib":
        out.push({
          ...base,
          taskType,
          blanks: Array.isArray(q["blanks"])
            ? q["blanks"].map((b: Raw) => ({
                options: Array.isArray(b["options"])
                  ? b["options"].map((o: unknown) => str(o))
                  : [],
                answer: str(b["answer"]),
              }))
            : [],
        });
        break;
      case "wfd":
        out.push({
          ...base,
          taskType,
          answer: str(q["answer"]) || str(q["transcript"]),
          explanation: str(q["explanation"]),
        });
        break;
      case "lst_fib":
        out.push({
          ...base,
          taskType,
          answers: parseArrayAnswer(q["answer"]),
          explanation: str(q["explanation"]),
          trap: str(q["trap"]),
        });
        break;
      case "lst_hiw":
        out.push({
          ...base,
          taskType,
          errorIndexes: Array.isArray(q["errors"])
            ? q["errors"].map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
            : [],
          explanation: str(q["explanation"]),
          trap: str(q["trap"]),
        });
        break;
      case "mcq_single":
      case "mcq_multi":
      case "lst_mcq":
      case "lst_mcq_multi":
      case "lst_hcs":
      case "lst_smw":
        out.push({
          ...base,
          taskType,
          options: Array.isArray(q["options"]) ? q["options"].map((o: unknown) => str(o)) : [],
          answer: normalizeAnswers(q["answer"]),
          explanation: str(q["explanation"]),
          trap: str(q["trap"]),
        });
        break;
    }
  }
  return out
    .filter((q) => q.id.length > 0 && q.text.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

const jsonOf = (m: { default: unknown }) => m.default;

/** Um import dinâmico por task type → cada JSON vira um chunk separado. */
const LOADERS: Record<TaskType, () => Promise<unknown>> = {
  read_aloud: () => import("@/data/pte/read_aloud.json").then(jsonOf),
  repeat_sentence: () => import("@/data/pte/repeat_sentence.json").then(jsonOf),
  retell_lecture: () => import("@/data/pte/retell_lecture.json").then(jsonOf),
  answer_short: () => import("@/data/pte/answer_short.json").then(jsonOf),
  swt: () => import("@/data/pte/swt.json").then(jsonOf),
  write_essay: () => import("@/data/pte/write_essay.json").then(jsonOf),
  reorder_paragraphs: () => import("@/data/pte/reorder_paragraphs.json").then(jsonOf),
  read_fib: () => import("@/data/pte/read_fib.json").then(jsonOf),
  mcq_single: () => import("@/data/pte/mcq_single.json").then(jsonOf),
  mcq_multi: () => import("@/data/pte/mcq_multi.json").then(jsonOf),
  wfd: () => import("@/data/pte/wfd.json").then(jsonOf),
  lst_fib: () => import("@/data/pte/lst_fib.json").then(jsonOf),
  summarize_spoken_text: () => import("@/data/pte/summarize_spoken_text.json").then(jsonOf),
  lst_hiw: () => import("@/data/pte/lst_hiw.json").then(jsonOf),
  lst_hcs: () => import("@/data/pte/lst_hcs.json").then(jsonOf),
  lst_summary: () => import("@/data/pte/lst_summary.json").then(jsonOf),
  lst_smw: () => import("@/data/pte/lst_smw.json").then(jsonOf),
  lst_mcq: () => import("@/data/pte/lst_mcq.json").then(jsonOf),
  lst_mcq_multi: () => import("@/data/pte/lst_mcq_multi.json").then(jsonOf),
};

const typeCache = new Map<TaskType, Promise<Question[]>>();
const idCache = new Map<string, Question>();

/** Carrega (uma vez) todas as questões completas de um task type. */
export function loadTypeQuestions(taskType: TaskType): Promise<Question[]> {
  let p = typeCache.get(taskType);
  if (!p) {
    p = LOADERS[taskType]().then((json) => {
      const list = build(taskType, json);
      for (const q of list) idCache.set(q.id, q);
      return list;
    });
    // falha de rede/chunk não pode ficar presa no cache
    p.catch(() => typeCache.delete(taskType));
    typeCache.set(taskType, p);
  }
  return p;
}

/** Carrega uma questão completa pelo id (undefined se o id não existir no manifesto). */
export async function loadQuestion(id: string | undefined): Promise<Question | undefined> {
  const meta = getMeta(id);
  if (!meta) return undefined;
  const cached = idCache.get(meta.id);
  if (cached) return cached;
  await loadTypeQuestions(meta.taskType);
  return idCache.get(meta.id);
}

/** Carrega vários task types em paralelo (listas por seção, testes de integridade). */
export async function loadQuestions(taskTypes: TaskType[]): Promise<Question[]> {
  const lists = await Promise.all(taskTypes.map((t) => loadTypeQuestions(t)));
  return lists.flat();
}

export const ALL_TASK_TYPES = Object.keys(TYPE_META) as TaskType[];

export function loadAllQuestions(): Promise<Question[]> {
  return loadQuestions(ALL_TASK_TYPES);
}

/** Leitura síncrona de algo já carregado (undefined se ainda não foi). */
export function getLoadedQuestion(id: string | undefined): Question | undefined {
  return id ? idCache.get(id) : undefined;
}

export { SECTION_META, SECTION_ORDER, TYPE_META };
export type { Question, Section, TaskType };
