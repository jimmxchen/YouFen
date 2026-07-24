"use client";

import IntroAnimation from '@/components/ui/scroll-morph-hero'
import GradualBlur from '@/components/ui/GradualBlur'

export function Hero() {
  return (
    <section className="relative w-full h-screen pt-16 overflow-hidden">
      <div className="h-full overflow-y-auto">
        <IntroAnimation />
      </div>

      <GradualBlur
        position="bottom"
        height="8rem"
        strength={3}
        divCount={8}
        curve="bezier"
        opacity={0.9}
      />
    </section>
  )
}
