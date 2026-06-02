import posthog from 'posthog-js'

export const ANALYTICS_OPT_OUT_STORAGE = 'openboard-ai:analytics-opt-out'

let initialized = false
let enabled = false

export function isOptedOut(): boolean {
  if (typeof window === 'undefined') return true
  if (navigator.doNotTrack === '1') return true
  return window.localStorage.getItem(ANALYTICS_OPT_OUT_STORAGE) === '1'
}

export function isAnalyticsEnabled(): boolean {
  return enabled && initialized && !isOptedOut()
}

export function initPostHog(): void {
  if (initialized) return
  if (typeof window === 'undefined') return
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return

  try {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      opt_out_capturing_by_default: isOptedOut(),
      loaded: (ph) => {
        ph.register({
          app_version: __APP_VERSION__,
          client_kind: 'web',
        })
      },
    })
    initialized = true
    enabled = true
  } catch (err) {
    console.warn('[analytics] posthog init failed', err)
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return
  try {
    posthog.capture(event, props)
  } catch (err) {
    console.warn('[analytics] capture failed', event, err)
  }
}

/**
 * Set the opt-out state. Persists to localStorage and updates PostHog so the
 * current session honors the choice immediately. We fire the toggle event
 * itself *before* opting out so the choice is visible in analytics once.
 */
export function setOptedOut(next: boolean): void {
  if (typeof window === 'undefined') return
  if (next) {
    track('analytics_opt_out_toggled', { opted_out: true })
    window.localStorage.setItem(ANALYTICS_OPT_OUT_STORAGE, '1')
    if (initialized) {
      try {
        posthog.opt_out_capturing()
        posthog.reset()
      } catch (err) {
        console.warn('[analytics] opt-out failed', err)
      }
    }
  } else {
    window.localStorage.removeItem(ANALYTICS_OPT_OUT_STORAGE)
    if (initialized) {
      try {
        posthog.opt_in_capturing()
      } catch (err) {
        console.warn('[analytics] opt-in failed', err)
      }
    }
    track('analytics_opt_out_toggled', { opted_out: false })
  }
}

/**
 * Tiny non-cryptographic hash of a board id. We don't need a strong hash —
 * just enough to keep raw board URL tokens out of analytics payloads while
 * still letting us group events for the same board within a session.
 */
export function hashBoardId(id: string): string {
  return hashValue(id)
}

export function hashValue(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
