// Gera src/data/pte/manifest.json — índice leve (id, tipo, tópico, fonte, nº de palavras, dificuldade)
// de todas as questões, para Home/listas/sessões não precisarem carregar os JSONs completos.
// Uso: node scripts/build-manifest.mjs   (rode sempre que src/data/pte/*.json mudar; o teste bank-integrity avisa se estiver velho)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "pte");

// arquivo → [taskType, seção] (espelha TYPE_META em src/lib/pte/types.ts; o teste garante a paridade)
const FILES = {
  "read_aloud.json": ["read_aloud", "speaking"],
  "repeat_sentence.json": ["repeat_sentence", "speaking"],
  "retell_lecture.json": ["retell_lecture", "speaking"],
  "answer_short.json": ["answer_short", "speaking"],
  "swt.json": ["swt", "writing"],
  "write_essay.json": ["write_essay", "writing"],
  "reorder_paragraphs.json": ["reorder_paragraphs", "reading"],
  "read_fib.json": ["read_fib", "reading"],
  "mcq_single.json": ["mcq_single", "reading"],
  "mcq_multi.json": ["mcq_multi", "reading"],
  "wfd.json": ["wfd", "listening"],
  "lst_fib.json": ["lst_fib", "listening"],
  "summarize_spoken_text.json": ["summarize_spoken_text", "listening"],
  "lst_hiw.json": ["lst_hiw", "listening"],
  "lst_hcs.json": ["lst_hcs", "listening"],
  "lst_summary.json": ["lst_summary", "listening"],
  "lst_smw.json": ["lst_smw", "listening"],
  "lst_mcq.json": ["lst_mcq", "listening"],
  "lst_mcq_multi.json": ["lst_mcq_multi", "listening"],
};
const SECTION_ORDER = ["speaking", "writing", "reading", "listening"];

const str = (v) => (typeof v === "string" ? v.trim() : "");
const tokenize = (t) =>
  t
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

const rows = [];
for (const [file, [taskType, section]] of Object.entries(FILES)) {
  const json = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  const list = Array.isArray(json) ? json : (json.questions ?? []);
  for (const q of list) {
    const id = str(q.id);
    const text = str(q.text) || str(q.content);
    if (!id || !text) continue;
    const row = {
      id,
      t: taskType,
      s: section,
      topic: str(q.topic) || "sem tópico",
      src: str(q.source),
      wc:
        typeof q.word_count === "number" && Number.isFinite(q.word_count)
          ? q.word_count
          : tokenize(text).length,
    };
    if (["easy", "medium", "hard"].includes(q.difficulty)) row.d = q.difficulty;
    rows.push(row);
  }
}
rows.sort(
  (a, b) => SECTION_ORDER.indexOf(a.s) - SECTION_ORDER.indexOf(b.s) || a.id.localeCompare(b.id),
);
writeFileSync(join(DIR, "manifest.json"), JSON.stringify(rows) + "\n");
console.log(`manifest.json: ${rows.length} questões`);
