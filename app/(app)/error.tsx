'use client'

import { useEffect } from 'react'

import { ErrorScreen } from '@/components/shell/ErrorScreen'
import { Button } from '@/components/ui/primitives'

/** Caught at the route. Nothing you had saved is lost; the write either landed or it didn't. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorScreen
      title="This screen didn't load"
      blurb="Something failed on the server. Anything already saved is still saved. Try again, and if it keeps happening, the server log has the details under the reference below."
      digest={error.digest}
      action={
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
      }
    />
  )
}
