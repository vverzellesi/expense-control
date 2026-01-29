import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/email"

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
})

/**
 * Generates a random 6-digit code for password reset.
 */
function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = forgotPasswordSchema.safeParse(body)
    if (!result.success) {
      // Still return generic message to prevent email enumeration
      return NextResponse.json(
        { message: "Se o email existir, você receberá um código" },
        { status: 200 }
      )
    }

    const { email } = result.data
    const normalizedEmail = email.toLowerCase()

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    // If user doesn't exist, return success to prevent email enumeration
    if (!user) {
      return NextResponse.json(
        { message: "Se o email existir, você receberá um código" },
        { status: 200 }
      )
    }

    // Generate 6-digit code
    const code = generateResetCode()

    // Set expiration to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Invalidate any existing unused codes for this email
    await prisma.passwordResetCode.updateMany({
      where: {
        email: normalizedEmail,
        used: false,
      },
      data: {
        used: true,
      },
    })

    // Store the new code
    await prisma.passwordResetCode.create({
      data: {
        email: normalizedEmail,
        code,
        expiresAt,
      },
    })

    // Send email with the code
    await sendPasswordResetEmail(normalizedEmail, code)

    return NextResponse.json(
      { message: "Se o email existir, você receberá um código" },
      { status: 200 }
    )
  } catch (error) {
    console.error("Forgot password error:", error)
    // Return generic message even on error to prevent information leakage
    return NextResponse.json(
      { message: "Se o email existir, você receberá um código" },
      { status: 200 }
    )
  }
}
