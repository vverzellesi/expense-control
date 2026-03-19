'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Check, AlertCircle, Loader2 } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MEMBER: 'Membro',
  LIMITED: 'Limitado',
}

type InviteInfo = {
  spaceName: string
  role: string
  expiresAt: string
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const router = useRouter()
  const [code, setCode] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    params.then((p) => setCode(p.code))
  }, [params])

  useEffect(() => {
    if (!code) return

    fetch(`/api/invites/${code}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Convite inválido')
        }
        return res.json()
      })
      .then(setInvite)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [code])

  async function handleAccept() {
    if (!code) return
    setAccepting(true)
    setError(null)

    try {
      const res = await fetch(`/api/invites/${code}/accept`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao aceitar convite')
      }

      setAccepted(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aceitar convite')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-50 px-4 overflow-hidden">
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-emerald-100 opacity-40 blur-3xl" />
      <div className="absolute -right-20 bottom-20 h-96 w-96 rounded-full bg-emerald-50 opacity-60 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image src="/logo.svg" alt="MyPocket" width={200} height={50} priority />
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <CardTitle>Convite para Espaço Compartilhado</CardTitle>
            <CardDescription>
              {loading
                ? 'Verificando convite...'
                : invite
                  ? `Você foi convidado para "${invite.spaceName}"`
                  : 'Convite indisponível'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            )}

            {!loading && error && !invite && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
                <Link
                  href="/dashboard"
                  className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Ir para o Dashboard
                </Link>
              </div>
            )}

            {!loading && invite && !accepted && (
              <>
                <div className="rounded-lg border bg-gray-50 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Espaço</span>
                    <span className="font-medium text-gray-900">{invite.spaceName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Seu papel</span>
                    <span className="font-medium text-gray-900">
                      {ROLE_LABELS[invite.role] || invite.role}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Expira em</span>
                    <span className="font-medium text-gray-900">
                      {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {accepting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Aceitando...
                    </>
                  ) : (
                    'Aceitar Convite'
                  )}
                </Button>
              </>
            )}

            {accepted && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                <Check className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
                <p className="font-medium text-emerald-800">Convite aceito!</p>
                <p className="mt-1 text-sm text-emerald-600">
                  Redirecionando para o dashboard...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
