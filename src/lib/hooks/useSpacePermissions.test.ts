import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { SpacePermissionsProvider } from '@/contexts/SpacePermissionsContext'
import { useSpacePermissions } from './useSpacePermissions'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SpacePermissionsProvider, null, children)

describe('useSpacePermissions (via Provider)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns loading true initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useSpacePermissions(), { wrapper })
    expect(result.current.loading).toBe(true)
  })

  it('returns default personal permissions when API returns personal context', async () => {
    const personalPermissions = {
      canViewTransactions: true,
      canEditTransactions: true,
      canViewAllTransactions: true,
      canViewInvestments: true,
      canViewBudgets: true,
      canManageSpace: false,
      canViewIncomes: true,
      isSpaceContext: false,
      role: null,
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(personalPermissions),
    })

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.canViewTransactions).toBe(true)
    expect(result.current.canEditTransactions).toBe(true)
    expect(result.current.canViewAllTransactions).toBe(true)
    expect(result.current.canViewInvestments).toBe(true)
    expect(result.current.canViewBudgets).toBe(true)
    expect(result.current.canManageSpace).toBe(false)
    expect(result.current.canViewIncomes).toBe(true)
    expect(result.current.isSpaceContext).toBe(false)
    expect(result.current.role).toBeNull()
  })

  it('returns space permissions when API returns space context', async () => {
    const spacePermissions = {
      canViewTransactions: true,
      canEditTransactions: true,
      canViewAllTransactions: false,
      canViewInvestments: false,
      canViewBudgets: false,
      canManageSpace: false,
      canViewIncomes: false,
      isSpaceContext: true,
      role: null,
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(spacePermissions),
    })

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.canViewInvestments).toBe(false)
    expect(result.current.canViewBudgets).toBe(false)
    expect(result.current.canManageSpace).toBe(false)
    expect(result.current.canViewIncomes).toBe(false)
    expect(result.current.isSpaceContext).toBe(true)
  })

  it('fetches from /api/spaces/active/permissions', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        canViewTransactions: true,
        canEditTransactions: true,
        canViewAllTransactions: true,
        canViewInvestments: true,
        canViewBudgets: true,
        canManageSpace: false,
        canViewIncomes: true,
        isSpaceContext: false,
        role: null,
      }),
    })

    renderHook(() => useSpacePermissions(), { wrapper })

    expect(mockFetch).toHaveBeenCalledWith('/api/spaces/active/permissions')
  })

  it('sets loading false even when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should keep default permissions on error
    expect(result.current.canViewTransactions).toBe(true)
    expect(result.current.isSpaceContext).toBe(false)
  })

  it('shares a single fetch across multiple hook consumers (cache test)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        canViewTransactions: true,
        canEditTransactions: true,
        canViewAllTransactions: true,
        canViewInvestments: true,
        canViewBudgets: true,
        canManageSpace: false,
        canViewIncomes: true,
        isSpaceContext: false,
        role: null,
      }),
    })

    renderHook(
      () => {
        useSpacePermissions()
        useSpacePermissions()
        useSpacePermissions()
      },
      { wrapper }
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  it('returns defaults with loading=false when used outside the Provider', () => {
    const { result } = renderHook(() => useSpacePermissions())
    expect(result.current.loading).toBe(false)
    expect(result.current.canViewTransactions).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
