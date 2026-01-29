import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Preview,
} from '@react-email/components'

interface PasswordResetEmailProps {
  code: string
}

export default function PasswordResetEmail({ code }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Seu código de redefinição de senha: {code}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>MyPocket</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={title}>
              Redefinição de Senha
            </Heading>

            <Text style={text}>
              Recebemos uma solicitação para redefinir a senha da sua conta MyPocket.
              Use o código abaixo para continuar:
            </Text>

            <Section style={codeContainer}>
              <Text style={codeText}>{code}</Text>
            </Section>

            <Text style={expirationText}>
              Este código expira em <strong>10 minutos</strong>.
            </Text>

            <Hr style={divider} />

            <Text style={securityNote}>
              Se você não solicitou esta redefinição de senha, ignore este email.
              Sua senha permanecerá inalterada e sua conta está segura.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} MyPocket. Todos os direitos reservados.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  maxWidth: '600px',
  borderRadius: '8px',
  overflow: 'hidden' as const,
}

const header = {
  backgroundColor: '#10b981',
  padding: '24px',
  textAlign: 'center' as const,
}

const logo = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
}

const content = {
  padding: '32px 40px',
}

const title = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  margin: '0 0 16px 0',
}

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 24px 0',
}

const codeContainer = {
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  margin: '0 0 24px 0',
}

const codeText = {
  color: '#10b981',
  fontSize: '36px',
  fontWeight: '700',
  letterSpacing: '8px',
  margin: '0',
}

const expirationText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  margin: '0 0 24px 0',
}

const divider = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
}

const securityNote = {
  color: '#9ca3af',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
}

const footer = {
  backgroundColor: '#f9fafb',
  padding: '24px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  margin: '0',
}
