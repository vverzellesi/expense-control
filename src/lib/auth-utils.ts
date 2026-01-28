import { auth } from "@/auth"
import { NextResponse } from "next/server"

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
 * Gets the session if available, returns null otherwise.
 * Use this for optional authentication checks.
 */
export async function getOptionalSession() {
  return await auth()
}
