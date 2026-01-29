import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { passwordSchema } from "@/auth"

const resetPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
  code: z.string().length(6, "Código deve ter 6 dígitos"),
  password: passwordSchema,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = resetPasswordSchema.safeParse(body)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors

      // Check if password validation failed
      if (errors.password) {
        return NextResponse.json(
          { error: errors.password[0] },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: "Código inválido ou expirado" },
        { status: 400 }
      )
    }

    const { email, code, password } = result.data
    const normalizedEmail = email.toLowerCase()

    // Verify the code exists, is not expired, and is not used
    const resetCode = await prisma.passwordResetCode.findFirst({
      where: {
        email: normalizedEmail,
        code,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    })

    if (!resetCode) {
      return NextResponse.json(
        { error: "Código inválido ou expirado" },
        { status: 400 }
      )
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user) {
      return NextResponse.json(
        { error: "Código inválido ou expirado" },
        { status: 400 }
      )
    }

    // Hash the new password with 12 salt rounds
    const hashedPassword = await bcrypt.hash(password, 12)

    // Update user password and mark code as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { hashedPassword },
      }),
      prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { used: true },
      }),
    ])

    return NextResponse.json(
      { message: "Senha redefinida com sucesso" },
      { status: 200 }
    )
  } catch (error) {
    console.error("Reset password error:", error)
    return NextResponse.json(
      { error: "Erro ao redefinir senha. Tente novamente." },
      { status: 500 }
    )
  }
}
