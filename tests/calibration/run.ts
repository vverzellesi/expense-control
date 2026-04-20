// tsx tests/calibration/run.ts
// Roda o parse-pipeline com GEMINI_API_KEY real contra arquivos locais em
// tests/calibration/fixtures/ (gitignored) e reporta métricas por arquivo.
//
// Requer CALIBRATION_USER_ID no env (um user_id real do DB) — a quota é
// rastreada por user. Usar um user dedicado evita poluir a quota real.

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, extname, basename } from "path";
import { parseFileForImport } from "../../src/lib/parse-pipeline";

const FIXTURES_DIR = resolve(__dirname, "fixtures");
const GROUND_TRUTH_DIR = resolve(__dirname, "ground-truth");

type GroundTruth = {
  bank: string;
  documentType: "fatura_cartao" | "extrato_bancario";
  expectedTransactionCount: number;
  samples?: Array<{ description: string; amount: number; date: string }>;
};

function mimeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  throw new Error(`Extensão não suportada: ${ext}`);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY ausente. Configure antes de rodar calibração.");
    process.exit(1);
  }

  const calibrationUserId = process.env.CALIBRATION_USER_ID;
  if (!calibrationUserId) {
    console.error(
      "❌ CALIBRATION_USER_ID ausente. Defina com um user_id real do DB\n" +
        "   (o pipeline precisa para reservar/contar quota). Exemplo:\n" +
        "   CALIBRATION_USER_ID=abc-123 tsx tests/calibration/run.ts"
    );
    process.exit(1);
  }

  if (!existsSync(FIXTURES_DIR)) {
    console.error(`❌ Diretório ${FIXTURES_DIR} não existe. Coloque PDFs/imagens anonimizados lá.`);
    process.exit(1);
  }

  const files = readdirSync(FIXTURES_DIR).filter((f) =>
    [".pdf", ".png", ".jpg", ".jpeg"].includes(extname(f).toLowerCase())
  );

  if (files.length === 0) {
    console.error(`❌ Nenhum arquivo em ${FIXTURES_DIR}. Adicione pelo menos 5 fixtures anonimizados.`);
    process.exit(1);
  }

  const results: Array<{
    file: string;
    source: string;
    bank: string;
    count: number;
    expected: number;
    accuracy: number;
    ok: boolean;
  }> = [];

  for (const file of files) {
    const buffer = readFileSync(resolve(FIXTURES_DIR, file));
    const gtPath = resolve(GROUND_TRUTH_DIR, basename(file, extname(file)) + ".json");
    const gt: GroundTruth | null = existsSync(gtPath)
      ? JSON.parse(readFileSync(gtPath, "utf-8"))
      : null;

    const t0 = Date.now();
    const res = await parseFileForImport({
      buffer,
      mimeType: mimeFor(file),
      filename: file,
      userId: calibrationUserId,
    });
    const ms = Date.now() - t0;

    if (res.kind === "error") {
      console.log(`❌ ${file}: erro ${res.error} (${ms}ms)`);
      results.push({
        file, source: "error", bank: "-",
        count: 0, expected: gt?.expectedTransactionCount ?? 0,
        accuracy: 0, ok: false,
      });
      continue;
    }

    const expected = gt?.expectedTransactionCount ?? res.transactions.length;
    const accuracy = expected > 0
      ? Math.min(res.transactions.length / expected, 1)
      : 1;

    const ok = accuracy >= 0.8 && res.source === "ai";
    console.log(
      `${ok ? "✅" : "⚠️"} ${file}: ${res.source} · ${res.bank} · ${res.transactions.length}/${expected} · accuracy=${(accuracy * 100).toFixed(0)}% · ${ms}ms`
    );

    results.push({
      file, source: res.source, bank: res.bank,
      count: res.transactions.length, expected,
      accuracy, ok,
    });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== Resumo ===`);
  console.log(`Passaram (AI + accuracy>=80%): ${passed}/${results.length}`);
  const overallAccuracy = results.reduce((s, r) => s + r.accuracy, 0) / results.length;
  console.log(`Accuracy média: ${(overallAccuracy * 100).toFixed(1)}%`);

  if (passed < results.length) {
    console.log(`\n⚠️  Calibração não passou em todos os arquivos. Ajustar prompt e repetir.`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
