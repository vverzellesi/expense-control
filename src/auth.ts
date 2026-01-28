import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { authConfig } from "./auth.config"

// Diagnostic: Log at module load time
console.log("[AUTH INIT] Module loading, NODE_ENV:", process.env.NODE_ENV)
console.log("[AUTH INIT] AUTH_SECRET set:", !!process.env.AUTH_SECRET)
console.log("[AUTH INIT] DATABASE_URL set:", !!process.env.DATABASE_URL)

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, "Senha deve ter no mínimo 8 caracteres")
  .regex(/[A-Z]/, "Senha deve ter pelo menos uma letra maiúscula")
  .regex(/[0-9]/, "Senha deve ter pelo menos um número")
  .regex(
    /[!@#$%^&*(),.?":{}|<>]/,
    "Senha deve ter pelo menos um caractere especial"
  )

const credentialsSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
})

// Diagnostic: Test PrismaAdapter creation
let adapter;
try {
  console.log("[AUTH INIT] Creating PrismaAdapter...")
  adapter = PrismaAdapter(prisma)
  console.log("[AUTH INIT] PrismaAdapter created successfully")
} catch (error) {
  console.error("[AUTH INIT] PrismaAdapter creation FAILED:", error)
  throw error
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        console.log("[AUTH] authorize() called")
        try {
          // Validate input
          const parsed = credentialsSchema.safeParse(credentials)
          if (!parsed.success) {
            return null
          }

          const { email, password } = parsed.data

          // Find user
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
          })

          if (!user || !user.hashedPassword) {
            return null
          }

          // Verify password
          const passwordMatch = await bcrypt.compare(password, user.hashedPassword)
          if (!passwordMatch) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          }
        } catch (error) {
          console.error("[AUTH] authorize() error:", error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})

// Export password schema for use in registration
export { passwordSchema }
