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
      const res = await fetch('/api/spaces')
      if (res.ok) {
        const data = await res.json()
        setSpaces(data)
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

  const activeSpace = spaces.find((s) => s.space.id === activeSpaceId)
  const label = activeSpace ? activeSpace.space.name : 'Minha Conta'

  if (loading || spaces.length === 0) return null

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

          {/* Link to create space or manage */}
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
