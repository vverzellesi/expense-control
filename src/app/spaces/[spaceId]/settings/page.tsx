'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { Users, Mail, Trash2, Copy, Upload, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Member = {
  id: string
  role: string
  userId: string
  user: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  }
}

type Invite = {
  id: string
  email: string | null
  role: string
  code: string
  status: string
  createdAt: string
  expiresAt: string
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MEMBER: 'Membro',
  LIMITED: 'Limitado',
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  MEMBER: 'bg-blue-100 text-blue-800 border-blue-200',
  LIMITED: 'bg-gray-100 text-gray-800 border-gray-200',
}

export default function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { toast } = useToast()

  const [spaceId, setSpaceId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)

  useEffect(() => {
    params.then((p) => setSpaceId(p.spaceId))
  }, [params])

  useEffect(() => {
    if (spaceId) fetchData()
  }, [spaceId])

  async function fetchData() {
    setLoading(true)
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch(`/api/spaces/${spaceId}/members`),
        fetch(`/api/spaces/${spaceId}/invites`),
      ])

      if (membersRes.ok) {
        setMembers(await membersRes.json())
      }
      if (invitesRes.ok) {
        setInvites(await invitesRes.json())
      }
    } finally {
      setLoading(false)
    }
  }

  async function updateMemberRole(memberId: string, role: string) {
    const res = await fetch(`/api/spaces/${spaceId}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })

    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role } : m))
      )
      toast({ title: 'Role atualizado' })
    } else {
      const data = await res.json()
      toast({ title: 'Erro', description: data.error, variant: 'destructive' })
    }
  }

  async function removeMember(memberId: string) {
    const res = await fetch(`/api/spaces/${spaceId}/members/${memberId}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      toast({ title: 'Membro removido' })
    } else {
      const data = await res.json()
      toast({ title: 'Erro', description: data.error, variant: 'destructive' })
    }
    setMemberToRemove(null)
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)

    try {
      const res = await fetch(`/api/spaces/${spaceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail || null,
          role: inviteRole,
        }),
      })

      if (res.ok) {
        const invite = await res.json()
        setInvites((prev) => [invite, ...prev])
        setInviteEmail('')
        setCreatedInviteLink(`${window.location.origin}/invite/${invite.code}`)
      } else {
        const data = await res.json()
        toast({ title: 'Erro', description: data.error, variant: 'destructive' })
      }
    } finally {
      setInviting(false)
    }
  }

  async function copyInviteLink(code: string) {
    const url = `${window.location.origin}/invite/${code}`
    await navigator.clipboard.writeText(url)
    toast({ title: 'Link copiado!' })
  }

  async function migrateData() {
    setMigrating(true)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/migrate`, {
        method: 'POST',
      })

      if (res.ok) {
        const data = await res.json()
        toast({
          title: 'Migração concluída',
          description: `${data.copiedCount} transações copiadas para o espaço.`,
        })
      } else {
        const data = await res.json()
        toast({ title: 'Erro', description: data.error, variant: 'destructive' })
      }
    } finally {
      setMigrating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações do Espaço</h1>
          <p className="text-sm text-gray-500">
            Gerencie membros, convites e dados do espaço compartilhado.
          </p>
        </div>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="members">Membros</TabsTrigger>
          <TabsTrigger value="invites">Convites</TabsTrigger>
          <TabsTrigger value="migration">Migração</TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Membros do Espaço
              </CardTitle>
              <CardDescription>
                Gerencie os membros e seus níveis de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        {member.user.image ? (
                          <img
                            src={member.user.image}
                            alt={member.user.name || ''}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <span className="text-sm font-medium text-emerald-700">
                            {(member.user.name || member.user.email || '?')[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {member.user.name || 'Sem nome'}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{member.user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={ROLE_COLORS[member.role] || ROLE_COLORS.MEMBER}
                        variant="outline"
                      >
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>

                      {/* Role selector for admins */}
                      <Select
                        value={member.role}
                        onValueChange={(value) => updateMemberRole(member.id, value)}
                      >
                        <SelectTrigger className="w-full sm:w-[130px] h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MEMBER">Membro</SelectItem>
                          <SelectItem value="LIMITED">Limitado</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-gray-400 hover:text-red-600"
                        onClick={() => setMemberToRemove(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {members.length === 0 && (
                  <p className="text-center text-gray-500 py-4">
                    Nenhum membro encontrado.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invites Tab */}
        <TabsContent value="invites">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-emerald-600" />
                Convites Pendentes
              </CardTitle>
              <CardDescription>
                Envie convites por email ou gere links de convite.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create invite form */}
              <form onSubmit={createInvite} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="invite-email">Email (opcional)</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="invite-role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger id="invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Membro</SelectItem>
                        <SelectItem value="LIMITED">Limitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={inviting} className="bg-emerald-600 hover:bg-emerald-700">
                  {inviting ? 'Enviando...' : 'Criar Convite'}
                </Button>
              </form>

              {createdInviteLink && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                  <p className="text-sm font-medium text-emerald-800">Convite criado! Compartilhe o link:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-white px-3 py-2 text-sm text-gray-700 border border-emerald-200 truncate">
                      {createdInviteLink}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                      onClick={async () => {
                        await navigator.clipboard.writeText(createdInviteLink)
                        toast({ title: 'Link copiado!' })
                      }}
                    >
                      <Copy className="mr-1 h-4 w-4" />
                      Copiar
                    </Button>
                  </div>
                  <button
                    onClick={() => setCreatedInviteLink(null)}
                    className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Existing invites */}
              {invites.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-700">Convites ativos</h3>
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {invite.email || 'Link de convite'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {ROLE_LABELS[invite.role]} - Expira em{' '}
                          {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyInviteLink(invite.code)}
                        className="gap-1 shrink-0"
                      >
                        <Copy className="h-3 w-3" />
                        Copiar link
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {invites.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  Nenhum convite pendente.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Migration Tab */}
        <TabsContent value="migration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-600" />
                Copiar dados pessoais
              </CardTitle>
              <CardDescription>
                Copie suas transações pessoais para o espaço compartilhado. Categorias e origens
                já foram copiadas na criação do espaço.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  <strong>Atenção:</strong> Esta ação copia todas as suas transações pessoais para
                  o espaço. As transações originais na sua conta pessoal não serão afetadas.
                  Executar múltiplas vezes pode criar duplicatas.
                </p>
              </div>
              <Button
                onClick={migrateData}
                disabled={migrating}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {migrating ? 'Migrando...' : 'Copiar transações para o espaço'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{memberToRemove?.user.name || memberToRemove?.user.email}</strong> do espaço?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => memberToRemove && removeMember(memberToRemove.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
