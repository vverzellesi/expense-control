"use client";

import { useEffect, useState } from "react";
import { Mail, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

interface PendingInvite {
  id: string;
  code: string;
  space: {
    id: string;
    name: string;
  };
}

export function PendingInvites() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/invites/pending")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setInvites(data);
        }
      })
      .catch(() => {});
  }, []);

  async function handleAccept(invite: PendingInvite) {
    setAccepting(invite.id);
    try {
      const res = await fetch(`/api/invites/${invite.code}/accept`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao aceitar convite");
      }

      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      toast({
        title: "Convite aceito",
        description: `Você agora faz parte do espaço "${invite.space.name}"`,
      });

      // Close dialog if no more invites
      if (invites.length <= 1) {
        setOpen(false);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description:
          error instanceof Error ? error.message : "Erro ao aceitar convite",
        variant: "destructive",
      });
    } finally {
      setAccepting(null);
    }
  }

  if (invites.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 transition-colors hover:bg-emerald-100"
          aria-label={`${invites.length} convite${invites.length > 1 ? "s" : ""} pendente${invites.length > 1 ? "s" : ""}`}
        >
          <Mail className="h-5 w-5" />
          <span className="flex-1 text-left">Convites</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            {invites.length}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convites pendentes</DialogTitle>
          <DialogDescription>
            Você tem {invites.length} convite{invites.length > 1 ? "s" : ""}{" "}
            para espaços compartilhados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {invite.space.name}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleAccept(invite)}
                disabled={accepting === invite.id}
              >
                {accepting === invite.id ? (
                  "Aceitando..."
                ) : (
                  <>
                    <Check className="mr-1 h-4 w-4" />
                    Aceitar
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
