"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const errorMessages: Record<string, string> = {
  Configuration: "Erro de configuração do servidor.",
  AccessDenied: "Acesso negado. Você não tem permissão para acessar.",
  Verification: "O link de verificação expirou ou já foi usado.",
  Default: "Ocorreu um erro durante a autenticação.",
  CredentialsSignin: "Email ou senha incorretos.",
}

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error") || "Default"
  const errorMessage = errorMessages[error] || errorMessages.Default

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center text-red-600">
          Erro de Autenticação
        </CardTitle>
        <CardDescription className="text-center">
          Não foi possível completar a autenticação
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-4 text-center text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
          {errorMessage}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <Button asChild className="w-full">
          <Link href="/auth/login">Tentar novamente</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Voltar ao início</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function ErrorFallback() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center text-red-600">
          Erro de Autenticação
        </CardTitle>
        <CardDescription className="text-center">
          Carregando...
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense fallback={<ErrorFallback />}>
        <ErrorContent />
      </Suspense>
    </div>
  )
}
