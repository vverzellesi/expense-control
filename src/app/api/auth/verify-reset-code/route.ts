import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"

const verifyCodeSchema = z.object({
  email: z.string().email("Email inválido"),
  code: z.string().length(6, "Código deve ter 6 dígitos"),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = verifyCodeSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: "Código inválido ou expirado" },
        { status: 400 }
      )
    }

    const { email, code } = result.data
    const normalizedEmail = email.toLowerCase()

    // Find the reset code
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

    return NextResponse.json({ valid: true }, { status: 200 })
  } catch (error) {
    console.error("Verify reset code error:", error)
    return NextResponse.json(
      { error: "Erro ao verificar código. Tente novamente." },
      { status: 500 }
    )
  }
}
