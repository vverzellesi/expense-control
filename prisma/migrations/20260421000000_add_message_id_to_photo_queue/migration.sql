-- AlterTable
ALTER TABLE "TelegramPhotoQueue" ADD COLUMN "messageId" INTEGER;

-- CreateIndex
-- Composto com mediaGroupId porque o orderBy por messageId sempre roda dentro
-- de um WHERE mediaGroupId = X (batch específico). Garante ordem estável das
-- páginas no caminho multi-part do parser de IA.
CREATE INDEX "TelegramPhotoQueue_mediaGroupId_messageId_idx" ON "TelegramPhotoQueue"("mediaGroupId", "messageId");
