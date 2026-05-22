import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { ApiKeyDialog } from '../settings/ApiKeyDialog'
import { useApiKey } from '../settings/useApiKey'
import { api } from '../lib/api'
import { LandingNav } from './landing/Nav'
import { Hero } from './landing/Hero'
import { Features } from './landing/Features'
import { HowItWorks } from './landing/HowItWorks'
import { Faq } from './landing/Faq'
import { ByokCallout } from './landing/ByokCallout'
import { LandingFooter } from './landing/Footer'

export function Landing() {
  const [, setLocation] = useLocation()
  const { key } = useApiKey()
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  // Distinguishes "key was set before user clicked CTA" from "key just transitioned
  // null→string because the user finished the setup dialog we opened."
  const awaitingKey = useRef(false)

  const launchBoard = useCallback(async () => {
    setCreating(true)
    try {
      const b = await api.createBoard()
      setLocation(`/b/${b.id}`)
    } catch (err) {
      console.error(err)
      alert('Failed to create board: ' + (err as Error).message)
      setCreating(false)
      setShowKeyDialog(false)
      awaitingKey.current = false
    }
  }, [setLocation])

  useEffect(() => {
    if (awaitingKey.current && key) {
      awaitingKey.current = false
      setShowKeyDialog(false)
      void launchBoard()
    }
  }, [key, launchBoard])

  const handleStart = useCallback(() => {
    if (creating) return
    if (!key) {
      awaitingKey.current = true
      setShowKeyDialog(true)
      return
    }
    void launchBoard()
  }, [creating, key, launchBoard])

  const handleDialogClose = useCallback(() => {
    awaitingKey.current = false
    setShowKeyDialog(false)
  }, [])

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <LandingNav />
      <main>
        <Hero onStart={handleStart} starting={creating} />
        <Features />
        <HowItWorks />
        <Faq />
        <ByokCallout onStart={handleStart} starting={creating} />
      </main>
      <LandingFooter />
      {showKeyDialog && !key && <ApiKeyDialog mode="setup" onClose={handleDialogClose} />}
    </div>
  )
}
