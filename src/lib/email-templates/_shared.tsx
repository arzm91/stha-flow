import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components'

export const BRAND = {
  name: 'STHApc',
  tagline: 'Gestão Industrial',
  primary: '#b45309',
  primaryDark: '#92400e',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#ffffff',
  surface: '#f9fafb',
}

export const styles = {
  main: { backgroundColor: BRAND.bg, fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: '24px 0' },
  container: { maxWidth: '560px', margin: '0 auto', padding: '0 24px' },
  card: {
    border: `1px solid ${BRAND.border}`,
    borderRadius: '10px',
    padding: '32px',
    backgroundColor: BRAND.bg,
  },
  brand: { fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase' as const, color: BRAND.primary, fontWeight: 700, margin: 0 },
  heading: { fontSize: '22px', fontWeight: 700, color: BRAND.text, margin: '12px 0 8px' },
  text: { fontSize: '15px', lineHeight: '22px', color: BRAND.text, margin: '12px 0' },
  muted: { fontSize: '13px', lineHeight: '20px', color: BRAND.muted, margin: '12px 0' },
  hr: { border: 'none', borderTop: `1px solid ${BRAND.border}`, margin: '24px 0' },
  footer: { fontSize: '12px', color: BRAND.muted, textAlign: 'center' as const, padding: '20px 8px 0' },
  badge: (bg: string, color: string) => ({
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: bg,
    color,
  }),
  panel: {
    backgroundColor: BRAND.surface,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '8px',
    padding: '16px 18px',
    margin: '16px 0',
  },
  rowLabel: { fontSize: '12px', color: BRAND.muted, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '1px' },
  rowValue: { fontSize: '15px', color: BRAND.text, margin: '2px 0 12px', fontWeight: 500 },
}

export function EmailShell({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={{ padding: '0 0 16px' }}>
            <Text style={styles.brand}>{BRAND.name} · {BRAND.tagline}</Text>
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            © {new Date().getFullYear()} {BRAND.name} — Sistema de Gestão Industrial
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
