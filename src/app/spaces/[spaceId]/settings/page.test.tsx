import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import SpaceSettingsPage from './page'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockParams = { spaceId: 'space-1' }

const mockMembers = [
  {
    id: 'member-1',
    role: 'ADMIN',
    userId: 'user-1',
    user: { id: 'user-1', name: 'Alice', email: 'alice@test.com', image: null },
  },
  {
    id: 'member-2',
    role: 'MEMBER',
    userId: 'user-2',
    user: { id: 'user-2', name: 'Bob', email: 'bob@test.com', image: null },
  },
]

const mockInvites = [
  {
    id: 'inv-1',
    email: 'carol@test.com',
    role: 'MEMBER',
    code: 'abc123',
    status: 'PENDING',
    createdAt: '2026-03-07T00:00:00Z',
    expiresAt: '2026-03-14T00:00:00Z',
  },
]

function setupFetchMock() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMembers),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInvites),
    })
}

describe('SpaceSettingsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('renders members tab with member list', async () => {
    setupFetchMock()

    render(<SpaceSettingsPage params={Promise.resolve(mockParams)} />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('renders tab navigation with Membros, Convites, Migração', async () => {
    setupFetchMock()

    render(<SpaceSettingsPage params={Promise.resolve(mockParams)} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Membros' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Convites' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Migração' })).toBeInTheDocument()
    })
  })

  it('fetches members and invites for the space', async () => {
    setupFetchMock()

    render(<SpaceSettingsPage params={Promise.resolve(mockParams)} />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/spaces/space-1/members')
      expect(mockFetch).toHaveBeenCalledWith('/api/spaces/space-1/invites')
    })
  })

  it('shows member emails', async () => {
    setupFetchMock()

    render(<SpaceSettingsPage params={Promise.resolve(mockParams)} />)

    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument()
      expect(screen.getByText('bob@test.com')).toBeInTheDocument()
    })
  })

  it('renders page header', async () => {
    setupFetchMock()

    render(<SpaceSettingsPage params={Promise.resolve(mockParams)} />)

    await waitFor(() => {
      expect(screen.getByText('Configurações do Espaço')).toBeInTheDocument()
    })
  })
})
