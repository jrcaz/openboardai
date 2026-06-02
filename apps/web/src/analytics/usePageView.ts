import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { hashBoardId, hashValue, track } from './posthog'

const BOARD_PATH_RE = /^\/b\/([^/?#]+)/
const PUBLIC_PATH_RE = /^\/p\/([^/?#]+)/

/**
 * Mount once inside the router. Fires a `$pageview` event on every wouter
 * route change. When on a board URL, the raw board id is replaced with an
 * opaque hash so analytics never sees the actual board token.
 */
export function PageViewTracker() {
  const [location] = useLocation()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (lastSent.current === location) return
    lastSent.current = location
    const boardMatch = location.match(BOARD_PATH_RE)
    const publicMatch = location.match(PUBLIC_PATH_RE)
    const path = boardMatch ? '/b/:boardId' : publicMatch ? '/p/:token' : location
    track('$pageview', {
      path,
      ...(boardMatch ? { board_id_hash: hashBoardId(boardMatch[1]) } : {}),
      ...(publicMatch ? { public_token_hash: hashValue(publicMatch[1]) } : {}),
    })
  }, [location])

  return null
}
