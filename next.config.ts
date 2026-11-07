import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@electric-sql/pglite',
    'isomorphic-git',
    'pg',
  ],
  eslint: { ignoreDuringBuilds: true },
  // Nothing here is meant to be framed: Accept, Revoke, and the grant toggles
  // are one click each, which is exactly what clickjacking needs.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
