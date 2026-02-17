import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    simulation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}))

// Import route handlers and prisma mock after mocking
import { GET, POST } from '@/app/api/simulations/route'
import { PATCH, DELETE } from '@/app/api/simulations/[id]/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  simulation: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

// Helper to create NextRequest
function createRequest(url: string, options: RequestInit = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options)
}

// Mock simulation data
const createMockSimulation = (overrides = {}) => ({
  id: 'sim-1',
  description: 'iPhone 16',
  totalAmount: 8999,
  totalInstallments: 12,
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Tecnologia', color: '#3B82F6', icon: null },
  isActive: true,
  userId: testUser.id,
  createdAt: new Date('2026-02-17'),
  updatedAt: new Date('2026-02-17'),
  ...overrides
})

describe('GET /api/simulations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return all simulations for authenticated user', async () => {
    const mockSimulations = [
      createMockSimulation(),
      createMockSimulation({ id: 'sim-2', description: 'PS5' })
    ]
    mockPrisma.simulation.findMany.mockResolvedValue(mockSimulations)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(2)
    expect(data[0].description).toBe('iPhone 16')
    expect(data[1].description).toBe('PS5')
    expect(mockPrisma.simulation.findMany).toHaveBeenCalledWith({
      where: { userId: testUser.id },
      include: { category: true },
      orderBy: { createdAt: 'desc' }
    })
  })

  it('should return empty array when no simulations', async () => {
    mockPrisma.simulation.findMany.mockResolvedValue([])

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual([])
  })
})

describe('POST /api/simulations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a simulation with valid data', async () => {
    const newSim = createMockSimulation()
    mockPrisma.simulation.create.mockResolvedValue(newSim)

    const request = createRequest('http://localhost:3000/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'iPhone 16',
        totalAmount: 8999,
        totalInstallments: 12,
        categoryId: 'cat-1'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.description).toBe('iPhone 16')
    expect(mockPrisma.simulation.create).toHaveBeenCalledWith({
      data: {
        description: 'iPhone 16',
        totalAmount: 8999,
        totalInstallments: 12,
        categoryId: 'cat-1',
        userId: testUser.id
      },
      include: { category: true }
    })
  })

  it('should create a simulation without categoryId', async () => {
    const newSim = createMockSimulation({ categoryId: null, category: null })
    mockPrisma.simulation.create.mockResolvedValue(newSim)

    const request = createRequest('http://localhost:3000/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Viagem',
        totalAmount: 5000,
        totalInstallments: 6
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(mockPrisma.simulation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: null })
      })
    )
  })

  it('should return 400 when description is missing', async () => {
    const request = createRequest('http://localhost:3000/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalAmount: 8999,
        totalInstallments: 12
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('should return 400 when totalAmount is missing', async () => {
    const request = createRequest('http://localhost:3000/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'iPhone 16',
        totalInstallments: 12
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('should return 400 when totalInstallments is missing', async () => {
    const request = createRequest('http://localhost:3000/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'iPhone 16',
        totalAmount: 8999
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/simulations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update isActive for a simulation', async () => {
    const existing = createMockSimulation()
    mockPrisma.simulation.findFirst.mockResolvedValue(existing)
    mockPrisma.simulation.update.mockResolvedValue({ ...existing, isActive: false })

    const request = createRequest('http://localhost:3000/api/simulations/sim-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false })
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'sim-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.isActive).toBe(false)
    expect(mockPrisma.simulation.findFirst).toHaveBeenCalledWith({
      where: { id: 'sim-1', userId: testUser.id }
    })
    expect(mockPrisma.simulation.update).toHaveBeenCalledWith({
      where: { id: 'sim-1' },
      data: { isActive: false },
      include: { category: true }
    })
  })

  it('should update multiple fields', async () => {
    const existing = createMockSimulation()
    mockPrisma.simulation.findFirst.mockResolvedValue(existing)
    mockPrisma.simulation.update.mockResolvedValue({
      ...existing,
      description: 'Updated',
      totalAmount: 5000
    })

    const request = createRequest('http://localhost:3000/api/simulations/sim-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Updated',
        totalAmount: 5000
      })
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'sim-1' }) })

    expect(response.status).toBe(200)
    expect(mockPrisma.simulation.update).toHaveBeenCalledWith({
      where: { id: 'sim-1' },
      data: { description: 'Updated', totalAmount: 5000 },
      include: { category: true }
    })
  })

  it('should return 404 when simulation not found', async () => {
    mockPrisma.simulation.findFirst.mockResolvedValue(null)

    const request = createRequest('http://localhost:3000/api/simulations/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false })
    })

    const response = await PATCH(request, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/simulations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete a simulation', async () => {
    const existing = createMockSimulation()
    mockPrisma.simulation.findFirst.mockResolvedValue(existing)
    mockPrisma.simulation.delete.mockResolvedValue(existing)

    const request = createRequest('http://localhost:3000/api/simulations/sim-1', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'sim-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockPrisma.simulation.delete).toHaveBeenCalledWith({
      where: { id: 'sim-1' }
    })
  })

  it('should return 404 when simulation not found', async () => {
    mockPrisma.simulation.findFirst.mockResolvedValue(null)

    const request = createRequest('http://localhost:3000/api/simulations/nonexistent', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })
})
