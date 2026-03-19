'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Loader2 } from 'lucide-react'

type SpaceMembership = {
  role: string
  space: { id: string; name: string }
}

export default function SpacesPage() {
  const router = useRouter()
  const [spaces, setSpaces] = useState<SpaceMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [spaceName, setSpaceName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/spaces')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setSpaces(data)
        // If user already has a space as ADMIN, redirect to settings
        const adminSpace = data.find((s: SpaceMembership) => s.role === 'ADMIN')
        if (adminSpace) {
          router.replace(`/spaces/${adminSpace.space.id}/settings`)
          return
        }
        // If user is member of a space (but not admin), still redirect
        if (data.length > 0) {
          router.replace(`/spaces/${data[0].space.id}/settings`)
          return
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!spaceName.trim()) return
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spaceName.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erro ao criar espaço')
        return
      }

      const space = await res.json()
      router.push(`/spaces/${space.id}/settings`)
    } catch {
      setError('Erro ao criar espaço')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Espaço Família</h1>
        <p className="text-sm text-gray-500">
          Crie um espaço compartilhado para gerenciar finanças junto com seu parceiro(a) ou família.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Users className="h-6 w-6 text-emerald-600" />
          </div>
          <CardTitle className="text-center">Criar Espaço Compartilhado</CardTitle>
          <CardDescription className="text-center">
            Suas categorias, origens e regras serão copiadas automaticamente para o novo espaço.
            Depois, convide membros pela página de configurações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="space-name">Nome do espaço</Label>
              <Input
                id="space-name"
                value={spaceName}
                onChange={(e) => setSpaceName(e.target.value)}
                placeholder="Ex: Família Silva, Casa, Casal"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={creating || !spaceName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Espaço'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
