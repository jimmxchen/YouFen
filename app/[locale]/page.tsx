import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import ScrollMorphHero from '@/components/ui/scroll-morph-hero'
import { Features } from '@/components/landing/features'
import { AdvancedFeatures } from '@/components/landing/advanced-features'
import { ValueCards } from '@/components/landing/value-cards'

export default function HomePage() {
  return (
    <main className="min-h-screen relative">
      <Navbar />
      <div className="sticky top-0 h-screen pt-16 z-0">
        <ScrollMorphHero />
      </div>
      <div className="relative z-10">
        <Features />
        <AdvancedFeatures />
        <ValueCards />
        <Footer />
      </div>
    </main>
  )
}
