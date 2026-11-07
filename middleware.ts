import { NextResponse, type NextRequest } from 'next/server'

/**
 * Clerk's middleware only mounts when Clerk is configured. Without keys the app
 * runs as a local single-user instance and the middleware is a pass-through.
 *
 * /api/mcp is never matched: agents authenticate with their own bearer token,
 * not a human session.
 */

const configured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
)

async function clerk(request: NextRequest, event: { waitUntil(p: Promise<unknown>): void }) {
  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server')
  const isPublic = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/webhooks(.*)'])
  const handler = clerkMiddleware(async (auth, req) => {
    if (!isPublic(req)) await auth.protect()
  })
  // @ts-expect-error — clerkMiddleware's signature is Next's middleware signature
  return handler(request, event)
}

export default function middleware(request: NextRequest, event: never) {
  if (configured) return clerk(request, event)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/mcp|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
}
