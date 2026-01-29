import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Button,
  Hr,
  Preview,
} from '@react-email/components'

interface WelcomeEmailProps {
  name: string
}

export default function WelcomeEmail({ name }: WelcomeEmailProps) {
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    : 'https://mypocket.app/dashboard'

  return (
    <Html>
      <Head />
      <Preview>Bem-vindo ao MyPocket! Sua jornada financeira começa agora.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>MyPocket</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={title}>
              Bem-vindo, {name}!
            </Heading>

            <Text style={text}>
              Estamos muito felizes em ter você conosco! O MyPocket vai te ajudar a
              organizar suas finanças pessoais de forma simples e inteligente.
            </Text>

            <Text style={text}>Com o MyPocket, você pode:</Text>

            <Section style={featureList}>
              <Text style={featureItem}>
                <span style={checkmark}>✓</span> Categorizar transações automaticamente
              </Text>
              <Text style={featureItem}>
                <span style={checkmark}>✓</span> Acompanhar orçamentos por categoria
              </Text>
              <Text style={featureItem}>
                <span style={checkmark}>✓</span> Importar extratos bancários (CSV)
              </Text>
              <Text style={featureItem}>
                <span style={checkmark}>✓</span> Visualizar gráficos e relatórios
              </Text>
              <Text style={featureItem}>
                <span style={checkmark}>✓</span> Gerenciar despesas recorrentes e parceladas
              </Text>
            </Section>

            <Section style={ctaContainer}>
              <Button style={ctaButton} href={dashboardUrl}>
                Acessar Dashboard
              </Button>
            </Section>

            <Hr style={divider} />

            <Text style={helpText}>
              Precisa de ajuda? Responda a este email que teremos prazer em ajudar.
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
  margin: '0 0 16px 0',
}

const featureList = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px 24px',
  margin: '0 0 24px 0',
}

const featureItem = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '28px',
  margin: '0',
}

const checkmark = {
  color: '#10b981',
  fontWeight: '700',
  marginRight: '8px',
}

const ctaContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const ctaButton = {
  backgroundColor: '#10b981',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  padding: '14px 32px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
}

const divider = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
}

const helpText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
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
