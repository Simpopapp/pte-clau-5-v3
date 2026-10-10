// Integridade do banco de questões. Este teste existe porque bugs de dados (gabarito vazio,
// lacunas sem `_`, resposta vazando na tela, marcadores de scraping no texto) passaram despercebidos
// quando só havia testes de contagem. Rode com `npm run bank:validate`.
import { describe, expect, it } from "vitest";

import { loadAllQuestions } from "@/lib/pte";
import { countFibBlanks } from "@/lib/pte/dictation";
import type { UnifiedQuestion } from "@/lib/pte";

const all = await loadAllQuestions();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Task types de uma única resposta correta vs. várias. */
const SINGLE = new Set(["mcq_single", "lst_mcq", "lst_hcs", "lst_smw"]);
const MULTI = new Set(["mcq_multi", "lst_mcq_multi"]);

const failures = (fn: (q: UnifiedQuestion) => string | null) =>
  all.flatMap((q) => {
    const msg = fn(q);
    return msg ? [`${q.id}: ${msg}`] : [];
  });

describe("Integridade do banco", () => {
  it("ids únicos e texto não vazio", () => {
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    expect(failures((q) => (q.text.trim() ? null : "texto vazio"))).toEqual([]);
  });

  it("questões de escolha: gabarito dentro do range e cardinalidade correta", () => {
    expect(
      failures((q) => {
        if (!("options" in q)) return null;
        if (q.options.length < 2) return "menos de 2 opções";
        if (q.answer.length === 0) return "gabarito vazio";
        if (q.answer.some((i) => i < 0 || i >= q.options.length)) return "gabarito fora do range";
        if (new Set(q.answer).size !== q.answer.length) return "gabarito repetido";
        if (SINGLE.has(q.taskType) && q.answer.length !== 1) return "esperava 1 resposta";
        if (MULTI.has(q.taskType) && q.answer.length < 2) return "esperava 2+ respostas";
        return null;
      }),
    ).toEqual([]);
  });

  it("FIB: nº de lacunas = nº de respostas, e a resposta não aparece na tela", () => {
    expect(
      failures((q) => {
        if (q.taskType !== "lst_fib") return null;
        const blanks = countFibBlanks(q.text);
        if (blanks === 0) return "texto sem lacunas";
        if (blanks !== q.answers.length)
          return `${blanks} lacunas vs ${q.answers.length} respostas`;
        if (q.answers.some((a) => !a.trim())) return "resposta vazia";
        // vazamento: palavra logo após a lacuna == resposta
        const toks = q.text.split(/\s+/);
        let b = 0;
        for (let i = 0; i < toks.length; i++) {
          if (/^[^\w\s]*_+[^\w\s]*$/.test(toks[i]!)) {
            const ans = q.answers[b++] ?? "";
            const next = norm(toks[i + 1] ?? "");
            if (next && next === norm(ans.split(/\s+/)[0] ?? ""))
              return `resposta "${ans}" visível`;
          }
        }
        return null;
      }),
    ).toEqual([]);
  });

  it("HIW: índices de erro cabem no texto", () => {
    expect(
      failures((q) => {
        if (q.taskType !== "lst_hiw") return null;
        const n = q.text.split(/\s+/).length;
        if (q.errorIndexes.length === 0) return "sem erros marcados";
        return q.errorIndexes.some((i) => i < 0 || i >= n) ? "índice fora do texto" : null;
      }),
    ).toEqual([]);
  });

  it("WFD / Repeat Sentence / Answer Short têm resposta de referência", () => {
    expect(
      failures((q) => {
        if (
          q.taskType === "wfd" ||
          q.taskType === "repeat_sentence" ||
          q.taskType === "answer_short"
        ) {
          return q.answer.trim() ? null : "resposta de referência vazia";
        }
        return null;
      }),
    ).toEqual([]);
  });

  it("sem resíduos de scraping (marcador _(n times)_, dificuldade colada) nos textos", () => {
    const bad = /[_\\]\(\s*\d+\s*times?\s*\)|\s-\s(easy|medium|hard|duplicate)\s*$/i;
    expect(
      failures((q) => {
        const fields = [q.text, "answer" in q && typeof q.answer === "string" ? q.answer : ""];
        return fields.some((f) => bad.test(f)) ? "marcador de scraping" : null;
      }),
    ).toEqual([]);
  });

  it("sem palavras duplicadas óbvias nem typos conhecidos em RS/WFD", () => {
    const known = /\b(the the|comes form|not allow to|esssay|enviroment|univerity|reseach)\b/i;
    expect(
      failures((q) =>
        q.taskType === "repeat_sentence" || q.taskType === "wfd"
          ? known.test(q.answer)
            ? "typo conhecido"
            : null
          : null,
      ),
    ).toEqual([]);
  });
});
