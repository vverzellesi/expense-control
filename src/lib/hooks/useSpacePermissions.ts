'use client'

import { useState, useEffect } from 'react'

type Permissions = {
  canViewTransactions: boolean
  canEditTransactions: boolean
  canViewAllTransactions: boolean
  canViewInvestments: boolean
  canViewBudgets: boolean
  canManageSpace: boolean
  canViewIncomes: boolean
  isSpaceContext: boolean
  role: string | null
}

export function useSpacePermissions(): Permissions & { loading: boolean } {
  const [permissions, setPermissions] = useState<Permissions>({
    canViewTransactions: true,
    canEditTransactions: true,
    canViewAllTransactions: true,
    canViewInvestments: true,
    canViewBudgets: true,
    canManageSpace: false,
    canViewIncomes: true,
    isSpaceContext: false,
    role: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/spaces/active/permissions')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch permissions')
        return res.json()
      })
      .then(setPermissions)
      .catch(() => {
        // Keep default permissions on error
      })
      .finally(() => setLoading(false))
  }, [])

  return { ...permissions, loading }
}
