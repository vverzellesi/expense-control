'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, ChevronDown, Plus, Users, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type SpaceMembership = {
  role: string
  space: { id: string; name: string }
}

export function SpaceSwitcher() {
  const [spaces, setSpaces] = useState<SpaceMembership[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSpaces()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchSpaces() {
    try {
      const [spacesRes, activeRes] = await Promise.all([
        fetch('/api/spaces'),
        fetch('/api/spaces/active/permissions'),
      ])
      if (spacesRes.ok) {
        const data = await spacesRes.json()
        setSpaces(data)
      }
      if (activeRes.ok) {
        const perms = await activeRes.json()
        if (perms.isSpaceContext && perms.spaceId) {
          setActiveSpaceId(perms.spaceId)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function switchSpace(spaceId: string | null) {
    if (spaceId === activeSpaceId) {
      setOpen(false)
      return
    }

    setSwitching(true)
    try {
      await fetch('/api/spaces/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId }),
      })
      setActiveSpaceId(spaceId)
      window.location.reload()
    } catch {
      setSwitching(false)
    }
  }

  const [creating, setCreating] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  async function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault()
    if (!newSpaceName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSpaceName.trim() }),
      })
      if (res.ok) {
        const space = await res.json()
        setNewSpaceName('')
        setShowCreateForm(false)
        // Switch to the new space
        await switchSpace(space.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const activeSpace = spaces.find((s) => s.space.id === activeSpaceId)
  const label = activeSpace ? activeSpace.space.name : 'Minha Conta'

  if (loading) return null

  // No spaces yet — show create button
  if (spaces.length === 0) {
    return (
      <div className="px-3 mb-2">
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Criar Espaço Família</span>
          </button>
        ) : (
          <form onSubmit={handleCreateSpace} className="space-y-2">
            <input
              type="text"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              placeholder="Nome do espaço"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newSpaceName.trim()}
                className="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Criando...' : 'Criar'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setNewSpaceName('') }}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="px-3 mb-2" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        aria-label={label}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border transition-colors',
          activeSpaceId
            ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
            : 'border-gray-200 hover:bg-gray-50',
          switching && 'opacity-50 cursor-wait'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeSpaceId ? (
            <Users className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <User className="h-4 w-4 text-gray-500 shrink-0" />
          )}
          <span className="font-medium truncate">{label}</span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {/* Personal account option */}
          <button
            onClick={() => switchSpace(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            <User className="h-4 w-4 text-gray-500" />
            <span className="flex-1 text-left">Minha Conta</span>
            {!activeSpaceId && <Check className="h-4 w-4 text-emerald-600" />}
          </button>

          <div className="h-px bg-gray-100" />

          {/* Spaces */}
          {spaces.map((membership) => (
            <button
              key={membership.space.id}
              onClick={() => switchSpace(membership.space.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              <Users className="h-4 w-4 text-emerald-600" />
              <span className="flex-1 text-left truncate">{membership.space.name}</span>
              {activeSpaceId === membership.space.id && (
                <Check className="h-4 w-4 text-emerald-600" />
              )}
            </button>
          ))}

          <div className="h-px bg-gray-100" />

          {/* Link to manage space */}
          {spaces.some((s) => s.role === 'ADMIN') && (
            <Link
              href={`/spaces/${spaces.find((s) => s.role === 'ADMIN')!.space.id}/settings`}
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Gerenciar espaço</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
