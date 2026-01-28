import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { authConfig } from "./auth.config"

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
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
            console.log("[AUTH] Validation failed:", parsed.error.errors)
            return null
          }

          const { email, password } = parsed.data
          console.log("[AUTH] Looking for user:", email.toLowerCase())

          // Find user
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
          })
          console.log("[AUTH] User found:", !!user, user ? `ID: ${user.id}` : "")

          if (!user || !user.hashedPassword) {
            console.log("[AUTH] No user or no hashedPassword")
            return null
          }

          // Verify password
          console.log("[AUTH] Comparing passwords...")
          const passwordMatch = await bcrypt.compare(password, user.hashedPassword)
          console.log("[AUTH] Password match:", passwordMatch)

          if (!passwordMatch) {
            return null
          }

          console.log("[AUTH] Success! Returning user")
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          }
        } catch (error) {
          console.error("[AUTH] Error in authorize:", error)
          throw error
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
