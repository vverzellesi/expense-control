import { Resend } from 'resend'
import PasswordResetEmail from '@/components/emails/PasswordResetEmail'
import WelcomeEmail from '@/components/emails/WelcomeEmail'

const FROM_EMAIL = 'MyPocket <onboarding@resend.dev>'

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set')
  }
  return new Resend(apiKey)
}

/**
 * Sends a password reset email with a 6-digit verification code.
 * The code expires in 10 minutes.
 */
export async function sendPasswordResetEmail(email: string, code: string) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Seu código de redefinição de senha - MyPocket',
    react: <PasswordResetEmail code={code} />,
  })

  if (error) {
    console.error('Failed to send password reset email:', error)
    throw new Error('Falha ao enviar email de redefinição de senha')
  }

  return data
}

/**
 * Sends a welcome email to new users after registration.
 */
export async function sendWelcomeEmail(email: string, name: string) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Bem-vindo ao MyPocket!',
    react: <WelcomeEmail name={name} />,
  })

  if (error) {
    console.error('Failed to send welcome email:', error)
    throw new Error('Falha ao enviar email de boas-vindas')
  }

  return data
}
