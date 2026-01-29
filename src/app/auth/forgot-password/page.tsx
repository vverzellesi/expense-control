"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface PasswordValidation {
  minLength: boolean
  hasUppercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
}

function validatePassword(password: string): PasswordValidation {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }
}

function PasswordRequirement({
  met,
  text,
}: {
  met: boolean
  text: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center ${
          met ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        {met && (
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        )}
      </div>
      <span className={met ? "text-green-700" : "text-gray-500"}>{text}</span>
    </div>
  )
}

type Step = "email" | "code" | "password"

export default function ForgotPasswordPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const passwordValidation = validatePassword(password)
  const isPasswordValid = Object.values(passwordValidation).every(Boolean)
  const doPasswordsMatch = password === confirmPassword && password.length > 0

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccessMessage("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao enviar codigo")
        setIsLoading(false)
        return
      }

      setSuccessMessage("Codigo enviado para seu email")
      setStep("code")
    } catch {
      setError("Ocorreu um erro. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccessMessage("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Codigo invalido")
        setIsLoading(false)
        return
      }

      setStep("password")
    } catch {
      setError("Ocorreu um erro. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResendCode() {
    setError("")
    setSuccessMessage("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao reenviar codigo")
        setIsLoading(false)
        return
      }

      setSuccessMessage("Codigo reenviado para seu email")
    } catch {
      setError("Ocorreu um erro. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccessMessage("")

    if (!isPasswordValid) {
      setError("A senha nao atende aos requisitos minimos")
      return
    }

    if (!doPasswordsMatch) {
      setError("As senhas nao coincidem")
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Erro ao redefinir senha")
        setIsLoading(false)
        return
      }

      router.push("/auth/login?reset=true")
    } catch {
      setError("Ocorreu um erro. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  function getStepTitle(): string {
    switch (step) {
      case "email":
        return "Recuperar Senha"
      case "code":
        return "Verificar Codigo"
      case "password":
        return "Nova Senha"
    }
  }

  function getStepDescription(): string {
    switch (step) {
      case "email":
        return "Digite seu email para receber o codigo de recuperacao"
      case "code":
        return "Digite o codigo de 6 digitos enviado para seu email"
      case "password":
        return "Digite sua nova senha"
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8 overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-emerald-100 opacity-40 blur-3xl" />
      <div className="absolute -right-20 bottom-20 h-96 w-96 rounded-full bg-emerald-50 opacity-60 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">MyPocket</h1>
        </div>
        <Card className="w-full">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">{getStepTitle()}</CardTitle>
            <CardDescription className="text-center">
              {getStepDescription()}
            </CardDescription>
          </CardHeader>

          {/* Step 1: Email Input */}
          {step === "email" && (
            <form onSubmit={handleSendCode}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                    {error}
                  </div>
                )}
                {successMessage && (
                  <div className="p-3 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md">
                    {successMessage}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Enviando..." : "Enviar codigo"}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Lembrou sua senha?{" "}
                  <Link href="/auth/login" className="text-primary hover:underline">
                    Entrar
                  </Link>
                </p>
              </CardFooter>
            </form>
          )}

          {/* Step 2: Code Verification */}
          {step === "code" && (
            <form onSubmit={handleVerifyCode}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                    {error}
                  </div>
                )}
                {successMessage && (
                  <div className="p-3 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md">
                    {successMessage}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="code">Codigo de verificacao</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    disabled={isLoading}
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button type="submit" className="w-full" disabled={isLoading || code.length !== 6}>
                  {isLoading ? "Verificando..." : "Verificar codigo"}
                </Button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline disabled:opacity-50"
                >
                  Reenviar codigo
                </button>
                <p className="text-sm text-center text-muted-foreground">
                  <Link href="/auth/login" className="text-primary hover:underline">
                    Voltar para login
                  </Link>
                </p>
              </CardFooter>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === "password" && (
            <form onSubmit={handleResetPassword}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  {password.length > 0 && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-md space-y-1">
                      <PasswordRequirement
                        met={passwordValidation.minLength}
                        text="Minimo 8 caracteres"
                      />
                      <PasswordRequirement
                        met={passwordValidation.hasUppercase}
                        text="Uma letra maiuscula"
                      />
                      <PasswordRequirement
                        met={passwordValidation.hasNumber}
                        text="Um numero"
                      />
                      <PasswordRequirement
                        met={passwordValidation.hasSpecial}
                        text="Um caractere especial (!@#$%^&*)"
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  {confirmPassword.length > 0 && !doPasswordsMatch && (
                    <p className="text-sm text-red-500">As senhas nao coincidem</p>
                  )}
                  {doPasswordsMatch && (
                    <p className="text-sm text-green-500">Senhas coincidem</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !isPasswordValid || !doPasswordsMatch}
                >
                  {isLoading ? "Redefinindo..." : "Redefinir senha"}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  <Link href="/auth/login" className="text-primary hover:underline">
                    Voltar para login
                  </Link>
                </p>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
