import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'

import { clerkConfigured } from '@/lib/auth'
import './globals.css'

/** One family for everything a person reads, and mono for anything an agent types. */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Open Brain',
  description: 'One place to write what your agents know. Every agent reads it before it answers.',
}

export const viewport: Viewport = {
  themeColor: '#141412',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
}

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured()) return <Document>{children}</Document>

  const { ClerkProvider } = await import('@clerk/nextjs')
  return (
    <ClerkProvider>
      <Document>{children}</Document>
    </ClerkProvider>
  )
}
