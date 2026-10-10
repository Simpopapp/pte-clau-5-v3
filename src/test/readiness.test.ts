import { describe, expect, it } from "vitest";

import { emptyState, type Attempt, type AppState } from "@/lib/storage";
import {
  weakestSection,
  readinessBySection,
  readinessLevel,
  type SectionReadiness,
} from "@/lib/pte/readiness";

const DAY = 86_400_000;

const TOTALS = { speaking: 100, writing: 50, reading: 50, listening: 100 };

function attempt(
  partial: Partial<Attempt> & { qid: string; taskType: Attempt["taskType"] },
): Attempt {
  return {
    ts: Date.now(),
    mode: "manual",
    contentScore: null,
    score: null,
    wpm: null,
    durationMs: 0,
    ...partial,
  };
}

function app(attempts: Attempt[]): AppState {
  return { ...emptyState(), attempts };
}

function bySection(rows: SectionReadiness[]): Map<string, SectionReadiness> {
  return new Map(rows.map((r) => [r.section, r]));
}

describe("readinessLevel", () => {
  it("rotula por faixa: <40, <65, <85, ≥85", () => {
    expect(readinessLevel(0)).toBe("Iniciando");
    expect(readinessLevel(39)).toBe("Iniciando");
    expect(readinessLevel(40)).toBe("Em progresso");
    expect(readinessLevel(64)).toBe("Em progresso");
    expect(readinessLevel(65)).toBe("Quase pronto");
    expect(readinessLevel(84)).toBe("Quase pronto");
    expect(readinessLevel(85)).toBe("Pronto");
    expect(readinessLevel(100)).toBe("Pronto");
  });
});

describe("readinessBySection", () => {
  it("app vazio: cobertura 0, score/nulls consistentes, nível Iniciando e sem dados", () => {
    const rows = readinessBySection(app([]), Date.now(), TOTALS);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.coverage).toBe(0);
      expect(r.recentScore).toBeNull();
      expect(r.stability).toBeNull();
      expect(r.score).toBe(0);
      expect(r.level).toBe("Iniciando");
      expect(r.hasData).toBe(false);
      expect(r.attempted).toBe(0);
    }
    expect(weakestSection(rows)).toBeNull();
  });

  it("sem score recente nem estabilidade, o peso deles vai todo para a cobertura", () => {
    // 1 tentativa há 8 dias (fora da janela de 7d e com <2 tentativas ⇒ só cobertura).
    const now = Date.now();
    const rows = readinessBySection(
      app([attempt({ qid: "ra-1", taskType: "read_aloud", ts: now - 8 * DAY, score: 90 })]),
      now,
      TOTALS,
    );
    const sp = bySection(rows).get("speaking")!;
    expect(sp.attempted).toBe(1);
    expect(sp.coverage).toBe(1);
    expect(sp.recentScore).toBeNull();
    expect(sp.stability).toBeNull();
    expect(sp.score).toBe(1); // 100% do peso na cobertura de 1%
    expect(sp.level).toBe("Iniciando");
    expect(sp.hasData).toBe(true);
  });

  it("cobertura + score recente: pesos 0.5/0.5 quando estabilidade é null", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([attempt({ qid: "ra-1", taskType: "read_aloud", ts: now - 2 * DAY, score: 80 })]),
      now,
      TOTALS,
    );
    const sp = bySection(rows).get("speaking")!;
    expect(sp.recentScore).toBe(80);
    expect(sp.stability).toBeNull();
    // (40·1 + 40·80) / 80 = 40.5 → 41 (Math.round de 40.5)
    expect(sp.score).toBe(41);
    expect(sp.level).toBe("Em progresso");
  });

  it("os três componentes entram com 40/40/20 quando todos existem", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([
        attempt({ qid: "ra-1", taskType: "read_aloud", ts: now - 1 * DAY, score: 80 }),
        attempt({ qid: "ra-2", taskType: "read_aloud", ts: now - 2 * DAY, score: 60 }),
      ]),
      now,
      TOTALS,
    );
    const sp = bySection(rows).get("speaking")!;
    expect(sp.coverage).toBe(2);
    expect(sp.recentScore).toBe(70); // (80+60)/2
    expect(sp.stability).toBeCloseTo(0.9, 5); // 1 − 10/100
    // (40·2 + 40·70 + 20·90) / 100 = (80 + 2800 + 1800) / 100 = 46.8 → 47
    expect(sp.score).toBe(47);
    expect(sp.level).toBe("Em progresso");
  });

  it("estabilidade alta (scores iguais) vale 1 e não pune", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([
        attempt({ qid: "wfd-1", taskType: "wfd", ts: now - 1 * DAY, score: 75 }),
        attempt({ qid: "wfd-2", taskType: "wfd", ts: now - 2 * DAY, score: 75 }),
      ]),
      now,
      TOTALS,
    );
    const li = bySection(rows).get("listening")!;
    expect(li.stability).toBe(1);
    expect(li.recentScore).toBe(75);
  });

  it("estabilidade null com uma única tentativa em 30 dias", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([attempt({ qid: "ra-1", taskType: "read_aloud", ts: now - 20 * DAY, score: 50 })]),
      now,
      TOTALS,
    );
    const sp = bySection(rows).get("speaking")!;
    expect(sp.recentScore).toBeNull();
    expect(sp.stability).toBeNull();
    expect(sp.score).toBe(1);
  });

  it("tentativas sem score são ignoradas (hasData continua false)", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([attempt({ qid: "ra-1", taskType: "read_aloud", ts: now, score: null })]),
      now,
      TOTALS,
    );
    const sp = bySection(rows).get("speaking")!;
    expect(sp.hasData).toBe(false);
    expect(sp.score).toBe(0);
    expect(weakestSection(rows)).toBeNull();
  });

  it("tentativas de outras seções não vazam para a seção errada", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([attempt({ qid: "ra-1", taskType: "read_aloud", ts: now, score: 80 })]),
      now,
      TOTALS,
    );
    const m = bySection(rows);
    expect(m.get("speaking")!.hasData).toBe(true);
    for (const s of ["writing", "reading", "listening"] as const) {
      expect(m.get(s)!.hasData).toBe(false);
    }
  });

  it("qids repetidos contam uma vez na cobertura", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([
        attempt({ qid: "ra-1", taskType: "read_aloud", ts: now - 1 * DAY, score: 70 }),
        attempt({ qid: "ra-1", taskType: "read_aloud", ts: now - 2 * DAY, score: 90 }),
      ]),
      now,
      TOTALS,
    );
    const sp = bySection(rows).get("speaking")!;
    expect(sp.attempted).toBe(1);
    expect(sp.coverage).toBe(1);
    expect(sp.recentScore).toBe(80); // (70+90)/2 — as duas tentativas estão nos últimos 7 dias
  });
});

describe("weakestSection", () => {
  it("aponta a seção de menor índice entre as com dados", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([
        attempt({ qid: "ra-1", taskType: "read_aloud", ts: now, score: 80 }),
        attempt({ qid: "wfd-1", taskType: "wfd", ts: now, score: 60 }),
      ]),
      now,
      TOTALS,
    );
    expect(weakestSection(rows)).toBe("listening");
  });

  it("empate resolve pela ordem canônica das seções", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([
        attempt({ qid: "ra-1", taskType: "read_aloud", ts: now, score: 80 }),
        attempt({ qid: "swt-1", taskType: "swt", ts: now, score: 80 }),
      ]),
      now,
      { speaking: 1, writing: 1, reading: 1, listening: 1 },
    );
    expect(weakestSection(rows)).toBe("speaking");
  });

  it("ignora seções sem dados mesmo com índice 0", () => {
    const now = Date.now();
    const rows = readinessBySection(
      app([attempt({ qid: "ra-1", taskType: "read_aloud", ts: now, score: 80 })]),
      now,
      TOTALS,
    );
    // reading/listening têm score 0 mas sem dados ⇒ speaking (41) é a "mais fraca com dados"? Não:
    // speaking tem dados; as outras não. Resultado: speaking.
    expect(weakestSection(rows)).toBe("speaking");
  });
});
