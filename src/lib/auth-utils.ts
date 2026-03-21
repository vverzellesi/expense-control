import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getActiveSpaceId, validateSpaceAccess, SpacePermissions, hasExplicitSpaceContext, getUserDefaultSpace, setActiveSpaceId } from "./space-context"

/**
 * Gets the authenticated user's ID from the session.
 * This should be used in every API route to ensure data isolation.
 *
 * @throws Error if user is not authenticated
 */
export async function getAuthenticatedUserId(): Promise<string> {
  const session = await auth()

  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  return session.user.id
}

/**
 * Helper to create an unauthorized response.
 * Use this when catching authentication errors in API routes.
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Não autorizado. Faça login para continuar." },
    { status: 401 }
  )
}

/**
 * Helper to create a forbidden response.
 * Use this when catching authorization errors in API routes.
 */
export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/**
 * Gets the session if available, returns null otherwise.
 * Use this for optional authentication checks.
 */
export async function getOptionalSession() {
  return await auth()
}

/**
 * Centralized API error handler.
 * Catches Unauthorized/Forbidden thrown by auth helpers and returns appropriate responses.
 */
export function handleApiError(error: unknown, context: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return unauthorizedResponse()
  }
  if (error instanceof Error && error.message === "Forbidden") {
    return forbiddenResponse()
  }
  console.error(`Error ${context}:`, error)
  return NextResponse.json({ error: `Erro ao ${context}` }, { status: 500 })
}

export type AuthContext = {
  userId: string
  spaceId: string | null
  permissions: SpacePermissions | null
  /** Para queries: userId se contexto pessoal, spaceId se contexto espaço */
  ownerFilter: { userId: string } | { spaceId: string }
}

/**
 * Gets the full auth context including space awareness.
 * Returns userId, active spaceId (if any), permissions, and ownerFilter for queries.
 * Auto-defaults to user's space if no explicit context has been set (first login).
 */
export async function getAuthContext(): Promise<AuthContext> {
  const userId = await getAuthenticatedUserId()
  const hasExplicit = await hasExplicitSpaceContext()

  // Auto-default to space on first request when no explicit choice was made
  if (!hasExplicit) {
    const defaultSpace = await getUserDefaultSpace(userId)
    if (defaultSpace) {
      await setActiveSpaceId(defaultSpace.spaceId)
      return {
        userId,
        spaceId: defaultSpace.spaceId,
        permissions: new SpacePermissions(defaultSpace.role as 'ADMIN' | 'MEMBER' | 'LIMITED'),
        ownerFilter: { spaceId: defaultSpace.spaceId },
      }
    }
    // No space — set to personal to prevent future DB lookups
    await setActiveSpaceId(null)
  }

  const spaceId = await getActiveSpaceId()

  if (!spaceId) {
    return {
      userId,
      spaceId: null,
      permissions: null,
      ownerFilter: { userId },
    }
  }

  const membership = await validateSpaceAccess(userId, spaceId)
  return {
    userId,
    spaceId,
    permissions: new SpacePermissions(membership.role),
    ownerFilter: { spaceId },
  }
}
