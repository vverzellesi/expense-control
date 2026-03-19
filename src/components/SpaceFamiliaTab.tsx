'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Users, Mail, Trash2, Copy, Loader2, Plus } from 'lucide-react'

type Member = {
  id: string
  role: string
  userId: string
  user: { id: string; name: string | null; email: string | null; image: string | null }
}

type Invite = {
  id: string
  email: string | null
  role: string
  code: string
  status: string
  expiresAt: string
}

type SpaceMembership = {
  role: string
  space: { id: string; name: string }
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

export function SpaceFamiliaTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [space, setSpace] = useState<{ id: string; name: string } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  // Create form
  const [spaceName, setSpaceName] = useState('')
  const [creating, setCreating] = useState(false)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviting, setInviting] = useState(false)

  // Member removal
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)

  // Space deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchSpaces()
  }, [])

  async function fetchSpaces() {
    setLoading(true)
    try {
      const res = await fetch('/api/spaces')
      if (!res.ok) return
      const memberships: SpaceMembership[] = await res.json()

      if (memberships.length > 0) {
        const adminSpace = memberships.find((m) => m.role === 'ADMIN')
        const s = adminSpace?.space || memberships[0].space
        setSpace(s)
        await fetchSpaceData(s.id)
      }
    } finally {
      setLoading(false)
    }
  }

  async function fetchSpaceData(spaceId: string) {
    const [membersRes, invitesRes] = await Promise.all([
      fetch(`/api/spaces/${spaceId}/members`),
      fetch(`/api/spaces/${spaceId}/invites`),
    ])
    if (membersRes.ok) setMembers(await membersRes.json())
    if (invitesRes.ok) setInvites(await invitesRes.json())
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!spaceName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spaceName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Erro', description: data.error, variant: 'destructive' })
        return
      }
      const data = await res.json()
      setSpace({ id: data.id, name: data.name })
      setSpaceName('')
      await fetchSpaceData(data.id)
      toast({ title: 'Espaço criado!' })
    } finally {
      setCreating(false)
    }
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!space) return
    setInviting(true)
    try {
      const res = await fetch(`/api/spaces/${space.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail || null, role: inviteRole }),
      })
      if (res.ok) {
        const invite = await res.json()
        setInvites((prev) => [invite, ...prev])
        setInviteEmail('')
        toast({ title: 'Convite criado' })
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

  async function handleDeleteSpace() {
    if (!space) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/spaces/${space.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Espaço excluído' })
        setSpace(null)
        setMembers([])
        setInvites([])
        setShowDeleteConfirm(false)
        window.location.reload()
      } else {
        const data = await res.json()
        toast({ title: 'Erro', description: data.error, variant: 'destructive' })
      }
    } finally {
      setDeleting(false)
    }
  }

  async function updateMemberRole(memberId: string, role: string) {
    if (!space) return
    const res = await fetch(`/api/spaces/${space.id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
      toast({ title: 'Role atualizado' })
    } else {
      const data = await res.json()
      toast({ title: 'Erro', description: data.error, variant: 'destructive' })
    }
  }

  async function removeMember(memberId: string) {
    if (!space) return
    const res = await fetch(`/api/spaces/${space.id}/members/${memberId}`, { method: 'DELETE' })
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      toast({ title: 'Membro removido' })
    } else {
      const data = await res.json()
      toast({ title: 'Erro', description: data.error, variant: 'destructive' })
    }
    setMemberToRemove(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    )
  }

  // No space yet — show create form
  if (!space) {
    return (
      <Card>
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Users className="h-6 w-6 text-emerald-600" />
          </div>
          <CardTitle className="text-center">Criar Espaço Compartilhado</CardTitle>
          <CardDescription className="text-center">
            Crie um espaço para gerenciar finanças com seu parceiro(a) ou família.
            Suas categorias e regras serão copiadas automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="create-space-name">Nome do espaço</Label>
              <Input
                id="create-space-name"
                value={spaceName}
                onChange={(e) => setSpaceName(e.target.value)}
                placeholder="Ex: Família Silva, Casa, Casal"
                className="min-h-[44px]"
              />
            </div>
            <Button
              type="submit"
              disabled={creating || !spaceName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
            >
              {creating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</>
              ) : (
                'Criar Espaço'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  // Has space — show management
  return (
    <div className="space-y-6">
      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Membros — {space.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                    <span className="text-sm font-medium text-emerald-700">
                      {(member.user.name || member.user.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{member.user.name || 'Sem nome'}</p>
                    <p className="text-sm text-gray-500">{member.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={ROLE_COLORS[member.role]} variant="outline">
                    {ROLE_LABELS[member.role]}
                  </Badge>
                  <Select
                    value={member.role}
                    onValueChange={(value) => updateMemberRole(member.id, value)}
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs">
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
                    className="h-8 w-8 text-gray-400 hover:text-red-600"
                    onClick={() => setMemberToRemove(member)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invites */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-600" />
            Convidar Membros
          </CardTitle>
          <CardDescription>
            Envie um convite por email ou gere um link para compartilhar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={createInvite} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Email (opcional — deixe vazio para link)"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-full sm:w-[130px] min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MEMBER">Membro</SelectItem>
                <SelectItem value="LIMITED">Limitado</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={inviting} className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" />
              {inviting ? 'Criando...' : 'Criar Convite'}
            </Button>
          </form>

          {invites.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Convites ativos</h4>
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{invite.email || 'Link de convite'}</p>
                    <p className="text-xs text-gray-500">
                      {ROLE_LABELS[invite.role]} — Expira em{' '}
                      {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyInviteLink(invite.code)} className="gap-1">
                    <Copy className="h-3 w-3" />
                    Copiar link
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Space */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-5 w-5" />
            Excluir Espaço
          </CardTitle>
          <CardDescription>
            Remove o espaço, todos os membros, convites, categorias e transações do espaço.
            Dados pessoais dos membros não são afetados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Excluir &quot;{space.name}&quot;
          </Button>
        </CardContent>
      </Card>

      {/* Remove Member Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{' '}
              <strong>{memberToRemove?.user.name || memberToRemove?.user.email}</strong> do espaço?
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

      {/* Delete Space Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir espaço &quot;{space.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todas as transações, categorias, orçamentos e
              dados do espaço serão permanentemente excluídos. Dados pessoais dos
              membros não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={handleDeleteSpace}
            >
              {deleting ? 'Excluindo...' : 'Excluir permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
