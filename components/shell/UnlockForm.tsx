'use client'

import { useState, useTransition } from 'react'

import { unlock } from '@/app/_actions/unlock'
import { Button, Input } from '@/components/ui/primitives'

export function UnlockForm() {
  const [, startTransition] = useTransition()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () =>
    startTransition(async () => {
      const result = await unlock(key)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      // A full navigation, not a client-side push: the router may still be
      // holding a payload rendered before the cookie existed, and sending you
      // back to this screen after a correct key is the worst possible bug here.
      window.location.href = '/workspace'
    })

  return (
    <>
      <Input
        autoFocus
        type="password"
        value={key}
        placeholder="Owner key"
        onChange={(event) => setKey(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && key && submit()}
      />
      {error ? <p className="mt-2.5 text-[13px] text-[var(--rubric)]">{error}</p> : null}
      <div className="mt-4">
        <Button variant="ink" size="md" disabled={!key} onClick={submit}>
          Unlock
        </Button>
      </div>
    </>
  )
}
