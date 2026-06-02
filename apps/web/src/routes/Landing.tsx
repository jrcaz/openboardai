import { useCallback, useState } from 'react'
import { useLocation } from 'wouter'
import { useSession } from '../lib/auth-client'
import { LandingNav } from './landing/Nav'
import { Hero } from './landing/Hero'
import { Features } from './landing/Features'
import { HtmlWidgets } from './landing/HtmlWidgets'
import { HowItWorks } from './landing/HowItWorks'
import { Faq } from './landing/Faq'
import { ByokCallout } from './landing/ByokCallout'
import { LandingFooter } from './landing/Footer'
import { ApiKeyDialog } from '../settings/ApiKeyDialog'
import { track } from '../analytics/posthog'

export function Landing() {
  const [, setLocation] = useLocation()
  const { data: session } = useSession()
  const [showPrivacy, setShowPrivacy] = useState(false)

  // Signed-in visitors go straight to their boards; everyone else signs up.
  const handleStart = useCallback(() => {
    const destination = session ? '/dashboard' : '/signup'
    track('landing_cta_clicked', {
      authenticated: !!session,
      destination,
    })
    setLocation(destination)
  }, [session, setLocation])

  const handleOpenPrivacy = useCallback(() => {
    track('privacy_settings_opened', { source: 'landing_footer' })
    setShowPrivacy(true)
  }, [])

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <LandingNav />
      <main>
        <Hero onStart={handleStart} starting={false} />
        <Features />
        <HtmlWidgets />
        <HowItWorks />
        <Faq />
        <ByokCallout onStart={handleStart} starting={false} />
      </main>
      <LandingFooter onOpenPrivacy={handleOpenPrivacy} />
      {showPrivacy && (
        <ApiKeyDialog mode="settings" onClose={() => setShowPrivacy(false)} />
      )}
    </div>
  )
}
