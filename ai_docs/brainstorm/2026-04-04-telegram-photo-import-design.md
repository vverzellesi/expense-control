# Importação de Faturas via Fotos no Telegram

**Data:** 2026-04-04
**Status:** Aprovado

## Contexto

O app já suporta importação de screenshots de faturas de cartão de crédito via OCR na interface web (multi-arquivo, parser genérico para C6, Nubank, Itaú, etc.). O bot do Telegram já suporta registro de gastos por texto e importação de CSV. Falta suporte a fotos.

O objetivo é permitir que o usuário envie múltiplas screenshots de fatura no chat do Telegram e importe todas as transações sem precisar abrir o app.

## Fluxo do Usuário

### 1. Envio de Imagens

O usuário seleciona N screenshots no Telegram e envia de uma vez (media group) ou uma por vez.

### 2. Coleta e Processamento

- Bot coleta todos os `file_id` do media group (3s de espera para agrupar)
- Processa OCR de cada imagem sequencialmente
- Edita uma mensagem de progresso: _"Processando imagem 3 de 8... (17 transações encontradas)"_

### 3. Resumo

Ao terminar, edita a mensagem com o resultado final:

```
Fatura C6 — 49 transações encontradas
Total: R$ 10.901,75
3 duplicatas removidas
Mês sugerido: 04/2026

[Confirmar importação] [Revisar] [Cancelar]
```

- Duplicatas (contra o banco de dados) são excluídas automaticamente
- Duplicatas dentro do próprio lote (entre imagens) também são removidas

### 4. Revisão (Opcional)

Se o usuário toca **Revisar**, o bot edita a mensagem para uma lista paginada (5 por página):

```
Página 1/10

1. ✅ 14/03 ED GAR R STO AMARO     R$ 8,00
   └ Outros

2. ✅ 14/03 TRENDMARKET             R$ 4,37
   └ Alimentação

3. ✅ 14/03 SEM PARAR             R$ 100,00
   └ Transporte

[✗1] [✗2] [✗3]          ← desmarcar/remarcar
[📁1] [📁2] [📁3]        ← mudar categoria
[← Ant]  [Próx →]
[Voltar ao resumo]
```

- **[✗N]** alterna incluir/excluir (toggle ✅ ↔ ❌)
- **[📁N]** abre a lista de categorias (reutiliza o fluxo existente)
- **[Voltar ao resumo]** mostra o resumo atualizado

### 5. Confirmação

Ao confirmar, importa via `importTransactions` (mesmo serviço do CSV). Ao cancelar, descarta.

## Modelo de Dados

### Nova tabela: `TelegramPhotoQueue`

```prisma
model TelegramPhotoQueue {
  id            String   @id @default(cuid())
  chatId        BigInt
  userId        String
  mediaGroupId  String
  fileId        String
  claimed       Boolean  @default(false)
  createdAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Tabela temporária para coletar file_ids de um media group antes de processar. Registros são deletados após processamento ou após 5 minutos (limpeza).

### Tabela existente: `TelegramPendingImport`

Reutilizada para armazenar o resultado do processamento (mesmo formato do CSV). O campo `payload` contém JSON com transações, banco, confiança, e metadados de seleção/categoria. Expira em 10 minutos.

## Fluxo de Batching (Media Groups em Serverless)

```
1. Foto chega (webhook) → INSERT na TelegramPhotoQueue (file_id + mediaGroupId)
2. Sleep 3 segundos (tempo para todas as fotos do grupo chegarem)
3. UPDATE ... SET claimed = true WHERE mediaGroupId = ? AND claimed = false
   → affected rows > 0: handler vencedor, processa tudo
   → affected rows = 0: outro handler já reivindicou, return silencioso
4. Handler vencedor: SELECT todos os file_ids → processa OCR → segue o fluxo
5. Limpeza: DELETE registros processados
```

Para fotos avulsas (sem `media_group_id`), gera-se um ID único e segue o mesmo fluxo.

## Mudanças no Código

### `src/lib/telegram/client.ts`

- Adicionar campo `photo` ao tipo `TelegramMessage` (array de `PhotoSize`)
- Adicionar tipo `PhotoSize` (`file_id`, `width`, `height`, `file_size`)
- Adicionar `downloadFileBinary(filePath): Promise<Buffer>` (o `downloadFile` atual retorna texto)

### `src/lib/telegram/bot.ts`

- Novo branch: `if (message.photo)` → `handlePhotoMessage()`

### `src/lib/telegram/commands.ts`

Novos handlers:

| Handler | Responsabilidade |
|---------|-----------------|
| `handlePhotoMessage` | Coleta file_id, salva na queue, sleep, claim, processa OCR, envia resumo |
| `handlePhotoConfirm` | Importa transações via `importTransactions` |
| `handlePhotoCancel` | Descarta o pending import |
| `handlePhotoReview` | Mostra lista paginada de transações |
| `handlePhotoToggle` | Marca/desmarca transação individual |
| `handlePhotoCategory` | Muda categoria (reutiliza pattern de `handleShowCategories`) |

### `prisma/schema.prisma`

- Nova model `TelegramPhotoQueue`
- Migration

### Callback Data Format

| Ação | Formato | Exemplo |
|------|---------|---------|
| Confirmar | `phcf:{importId}` | `phcf:abc123` |
| Cancelar | `phcc:{importId}` | `phcc:abc123` |
| Revisar | `phrv:{importId}:{page}` | `phrv:abc123:0` |
| Toggle | `phtg:{importId}:{index}` | `phtg:abc123:5` |
| Categoria | `phct:{importId}:{index}` | `phct:abc123:5` |
| Set categoria | `phsc:{importId}:{index}:{catId}` | `phsc:abc123:5:xyz` |
| Voltar resumo | `phbk:{importId}` | `phbk:abc123` |

Todos dentro do limite de 64 bytes do Telegram.

## Reutilização

Nenhuma lógica de negócio nova. O handler é uma cola entre:

- **OCR:** `processImageOCR()` de `ocr-parser.ts`
- **Parsing:** `parseStatementText()` de `statement-parser.ts`
- **Categorização:** `suggestCategory()` de `categorizer.ts`
- **Dedup:** `filterDuplicates()` de `dedup.ts`
- **Import:** `importTransactions()` de `import-service.ts`
- **Pending state:** tabela `TelegramPendingImport` existente

## Decisões

- **Duplicatas removidas automaticamente** — não aparecem no resumo nem na revisão
- **Transações com valor garbled pelo OCR** (ex: parcelas com texto sobreposto) são silenciosamente ignoradas — mesmo comportamento do web
- **Timeout do media group:** 3 segundos — suficiente para o Telegram entregar todas as fotos
- **Expiração do pending import:** 10 minutos — mesmo do CSV
- **Fotos avulsas:** funcionam como grupo de 1
