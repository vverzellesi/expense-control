"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ImagePlus, X } from "lucide-react";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ImagePreview {
  file: File;
  previewUrl: string;
}

const MAX_IMAGES = 3;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif"];

export function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setImages([]);
      setLoading(false);
      setIsDragOver(false);
    }
  }, [isOpen]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, [images]);

  function validateAndAddFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (images.length >= MAX_IMAGES) {
        toast({
          title: "Limite de imagens",
          description: `Máximo de ${MAX_IMAGES} imagens permitidas.`,
          variant: "destructive",
        });
        break;
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({
          title: "Tipo não suportado",
          description: `Use PNG, JPG ou GIF. Arquivo "${file.name}" ignorado.`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        toast({
          title: "Arquivo muito grande",
          description: `"${file.name}" excede o limite de 5MB.`,
          variant: "destructive",
        });
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      setImages((prev) => [...prev, { file, previewUrl }]);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o título e a descrição.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("userAgent", navigator.userAgent);
      formData.append("pageUrl", window.location.pathname);

      for (const img of images) {
        formData.append("images", img.file);
      }

      const response = await fetch("/api/bug-reports", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao enviar bug report.");
      }

      toast({
        title: "Bug reportado com sucesso!",
        description: "Obrigado pelo feedback. Vamos analisar o problema.",
      });

      onClose();
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar o bug report. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reportar Bug</DialogTitle>
          <DialogDescription>
            Descreva o problema encontrado. Sua mensagem será enviada para análise.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bug-title">Título</Label>
            <Input
              id="bug-title"
              placeholder="Resumo do problema"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-description">Descrição</Label>
            <Textarea
              id="bug-description"
              placeholder="Descreva o que aconteceu, o que você esperava e como reproduzir o problema..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Anexos (opcional)</Label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors ${
                isDragOver
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-300 hover:border-gray-400"
              } ${loading ? "pointer-events-none opacity-50" : ""}`}
            >
              <ImagePlus className="mb-2 h-6 w-6 text-gray-400" />
              <p className="text-sm text-gray-500">
                Arraste imagens ou clique para selecionar
              </p>
              <p className="text-xs text-gray-400">
                PNG, JPG ou GIF (máx. 5MB, até 3 imagens)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) validateAndAddFiles(e.target.files);
                e.target.value = "";
              }}
              disabled={loading}
            />
          </div>

          {/* Image previews */}
          {images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((img, index) => (
                <div key={img.previewUrl} className="relative group">
                  <img
                    src={img.previewUrl}
                    alt={`Anexo ${index + 1}`}
                    className="h-16 w-16 rounded-md object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    disabled={loading}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
