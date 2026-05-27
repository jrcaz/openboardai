import { useCallback } from 'react'
import { useLocation } from 'wouter'
import { useSession } from '../lib/auth-client'
import { LandingNav } from './landing/Nav'
import { Hero } from './landing/Hero'
import { Features } from './landing/Features'
import { HowItWorks } from './landing/HowItWorks'
import { ByokCallout } from './landing/ByokCallout'
import { LandingFooter } from './landing/Footer'

export function Landing() {
  const [, setLocation] = useLocation()
  const { data: session } = useSession()

  // Signed-in visitors go straight to their boards; everyone else signs up.
  const handleStart = useCallback(() => {
    setLocation(session ? '/dashboard' : '/signup')
  }, [session, setLocation])

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <LandingNav />
      <main>
        <Hero onStart={handleStart} starting={false} />
        <Features />
        <HowItWorks />
        <ByokCallout onStart={handleStart} starting={false} />
      </main>
      <LandingFooter />
    </div>
  )
}
