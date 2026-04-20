# Calibração manual do AI parser

Script ad-hoc pra validar o pipeline contra faturas/extratos reais antes do deploy.

## Uso

1. Coloque ao menos 5 arquivos PDF/JPG/PNG **anonimizados** em `tests/calibration/fixtures/` (gitignored)
2. (Opcional) Crie `tests/calibration/ground-truth/<nome-do-arquivo>.json` com:
   ```json
   {
     "bank": "Nubank",
     "documentType": "fatura_cartao",
     "expectedTransactionCount": 42
   }
   ```
3. `export GEMINI_API_KEY=<sua-key>`
4. `npx tsx tests/calibration/run.ts`

## Critério de passagem

- Pelo menos 80% das transações esperadas são extraídas por cada arquivo
- `source === "ai"` (não caiu em fallback)
- Log do resultado vai em `ai_docs/ai-parser-calibration/YYYY-MM-DD.md` (manualmente)

## Segurança

- **NUNCA** commitar arquivos em `fixtures/` — contêm PII.
- `.gitignore` já protege. Confira antes de `git add`.
