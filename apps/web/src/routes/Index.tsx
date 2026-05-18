import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { api } from '../lib/api'

export function Index() {
  const [, setLocation] = useLocation()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    api
      .createBoard()
      .then((b) => setLocation(`/b/${b.id}`))
      .catch((err) => {
        console.error(err)
        alert('Failed to create board: ' + (err as Error).message)
      })
  }, [setLocation])

  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Creating board…
    </div>
  )
}
