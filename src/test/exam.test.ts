import { beforeEach, describe, expect, it } from "vitest";

import {
  EXAM_PLAN,
  EXAM_SECONDS,
  buildExamQueue,
  estimateSeconds,
  examLabel,
  examQuestionCount,
  examTiming,
  gradeExamSummary,
  type HistoryAttempt,
} from "@/lib/pte/exam";
import { SECTION_ORDER, metaByType, type TaskType } from "@/lib/pte";

/** rand determinístico (0.5) — shuffle estável nos testes. */
const fixed = () => 0.5;

describe("EXAM_PLAN e tempos", () => {
  it("cobre as 4 seções e a versão integral é a concatenação delas", () => {
    for (const s of SECTION_ORDER) {
      expect(EXAM_PLAN[s]!.length).toBeGreaterThan(0);
    }
    expect(EXAM_PLAN.full!.length).toBe(
      SECTION_ORDER.reduce((n, s) => n + EXAM_PLAN[s]!.length, 0),
    );
  });

  it("todo task type tem tempo positivo e coerente", () => {
    const types = new Set<TaskType>(
      SECTION_ORDER.flatMap((s) => EXAM_PLAN[s]!.map((b) => b.taskType)),
    );
    expect(types.size).toBe(19);
    for (const t of types) {
      expect(examTiming(t)).toBeGreaterThan(0);
      expect(EXAM_SECONDS[t]).toBe(examTiming(t));
    }
  });

  it("contagens e tempo estimado respeitam o banco", () => {
    const n = examQuestionCount("speaking");
    expect(n).toBe(8); // 2 RA + 3 RS + 1 RL + 2 ASQ
    expect(estimateSeconds("speaking")).toBe(2 * 40 + 3 * 15 + 1 * 50 + 2 * 10);
    expect(examQuestionCount("full")).toBe(
      examQuestionCount("speaking") +
        examQuestionCount("writing") +
        examQuestionCount("reading") +
        examQuestionCount("listening"),
    );
  });

  it("label descreve a seção ou o completo", () => {
    expect(examLabel("full")).toBe("Simulado completo");
    expect(examLabel("speaking")).toBe("Simulado Speaking");
  });
});

describe("buildExamQueue", () => {
  it("gera fila estratificada com a contagem do plano", () => {
    const queue = buildExamQueue("speaking", fixed);
    expect(queue).toHaveLength(examQuestionCount("speaking"));
    expect(new Set(queue).size).toBe(queue.length); // sem repetição
  });

  it("fila completa não repete questões e cobre todos os tipos do plano", () => {
    const queue = buildExamQueue("full", fixed);
    expect(new Set(queue).size).toBe(queue.length);
    expect(queue).toHaveLength(examQuestionCount("full"));
  });
});

describe("gradeExamSummary", () => {
  const qidOf = (taskType: TaskType) => metaByType(taskType)[0]!.id;

  const history: HistoryAttempt[] = [
    { taskType: "wfd", score: 90 },
    { taskType: "wfd", score: 80 },
    { taskType: "wfd", score: 70, tags: ["exam"] }, // exame não conta como prática
    { taskType: "mcq_single", score: null },
  ];

  it("média geral, por seção e por tipo, comparando com a prática", () => {
    const results = [
      { qid: qidOf("wfd"), score: 100 },
      { qid: qidOf("wfd"), score: 80 },
      { qid: qidOf("swt"), score: null },
      { qid: qidOf("mcq_single"), score: 60 },
    ];
    const s = gradeExamSummary(results, history);
    expect(s.totalCount).toBe(4);
    expect(s.gradedCount).toBe(3);
    expect(s.overall).toBe(80); // (100 + 80 + 60) / 3
    const wfd = s.byType.find((t) => t.taskType === "wfd")!;
    expect(wfd.avg).toBe(90);
    expect(wfd.practiceAvg).toBe(85); // (90+80)/2, ignorando a tentativa de exame
    const swt = s.byType.find((t) => t.taskType === "swt")!;
    expect(swt).toBeUndefined(); // sem score → fora do por-tipo
    const writing = s.bySection.find((x) => x.section === "writing")!;
    expect(writing.avg).toBeNull();
    expect(writing.n).toBe(0);
  });

  it("lista os tipos mais fracos (média < 70)", () => {
    const results = [
      { qid: qidOf("mcq_single"), score: 60 },
      { qid: qidOf("wfd"), score: 95 },
    ];
    const s = gradeExamSummary(results, history);
    expect(s.weakest[0]!.taskType).toBe("mcq_single");
    expect(s.weakest.some((t) => t.taskType === "wfd")).toBe(false);
  });

  it("estado vazio: tudo null sem resultados com score", () => {
    const s = gradeExamSummary([], history);
    expect(s.overall).toBeNull();
    expect(s.byType).toHaveLength(0);
    expect(s.weakest).toHaveLength(0);
  });
});
