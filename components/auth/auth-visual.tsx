"use client"

import { useEffect, useState } from "react"

export function AuthVisual() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative w-full h-full bg-[#0a0a0b] overflow-hidden flex items-center justify-center">
      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Large glowing orbs */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Top-right warm orb */}
        <div
          className="absolute -top-20 -right-20 size-[500px] rounded-full blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(180,160,140,0.25) 0%, transparent 70%)",
            animation: mounted ? "orbFloat1 12s ease-in-out infinite" : "none",
          }}
        />
        {/* Bottom-left cool orb */}
        <div
          className="absolute -bottom-32 -left-32 size-[450px] rounded-full blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(140,160,180,0.2) 0%, transparent 70%)",
            animation: mounted ? "orbFloat2 14s ease-in-out infinite" : "none",
          }}
        />
        {/* Center accent orb */}
        <div
          className="absolute top-1/3 left-1/3 size-[300px] rounded-full blur-[100px]"
          style={{
            background:
              "radial-gradient(circle, rgba(200,180,150,0.15) 0%, transparent 70%)",
            animation: mounted ? "orbFloat3 10s ease-in-out infinite" : "none",
          }}
        />
      </div>

      {/* Abstract geometric rings */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.06]"
        viewBox="0 0 800 900"
        fill="none"
      >
        {/* Concentric circles */}
        <circle cx="400" cy="450" r="350" stroke="white" strokeWidth="0.5" />
        <circle cx="400" cy="450" r="280" stroke="white" strokeWidth="0.5" />
        <circle cx="400" cy="450" r="210" stroke="white" strokeWidth="0.5" />
        <circle cx="400" cy="450" r="140" stroke="white" strokeWidth="1" />

        {/* Intersecting arcs */}
        <path
          d="M 50 450 A 350 350 0 0 1 750 450"
          stroke="white"
          strokeWidth="0.5"
        />
        <path
          d="M 100 300 A 400 400 0 0 0 700 300"
          stroke="white"
          strokeWidth="0.5"
        />
        <path
          d="M 100 600 A 400 400 0 0 1 700 600"
          stroke="white"
          strokeWidth="0.5"
        />

        {/* Diagonal lines */}
        <line x1="0" y1="200" x2="300" y2="500" stroke="white" strokeWidth="0.3" />
        <line x1="800" y1="200" x2="500" y2="500" stroke="white" strokeWidth="0.3" />
        <line x1="0" y1="700" x2="300" y2="400" stroke="white" strokeWidth="0.3" />
        <line x1="800" y1="700" x2="500" y2="400" stroke="white" strokeWidth="0.3" />
      </svg>

      {/* Floating geometric shapes */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 800 900"
        fill="none"
      >
        {/* Diamond */}
        <g
          style={{
            animation: mounted ? "gentleDrift1 8s ease-in-out infinite" : "none",
            transformOrigin: "200px 300px",
          }}
        >
          <rect
            x="180"
            y="260"
            width="40"
            height="40"
            rx="6"
            transform="rotate(45 200 280)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
            fill="rgba(255,255,255,0.02)"
          />
        </g>

        {/* Small circle */}
        <g
          style={{
            animation: mounted ? "gentleDrift2 9s ease-in-out infinite" : "none",
            transformOrigin: "600px 200px",
          }}
        >
          <circle
            cx="600"
            cy="180"
            r="18"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1.5"
            fill="rgba(255,255,255,0.02)"
          />
        </g>

        {/* Rounded square */}
        <g
          style={{
            animation: mounted ? "gentleDrift3 10s ease-in-out infinite" : "none",
            transformOrigin: "150px 650px",
          }}
        >
          <rect
            x="130"
            y="620"
            width="36"
            height="36"
            rx="8"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1.5"
            fill="rgba(255,255,255,0.02)"
          />
        </g>

        {/* Triangle/dot cluster */}
        <g
          style={{
            animation: mounted ? "gentleDrift1 11s ease-in-out infinite" : "none",
            transformOrigin: "650px 650px",
          }}
        >
          <circle cx="650" cy="620" r="3" fill="rgba(255,255,255,0.12)" />
          <circle cx="670" cy="660" r="3" fill="rgba(255,255,255,0.12)" />
          <circle cx="630" cy="660" r="3" fill="rgba(255,255,255,0.12)" />
        </g>

        {/* Hexagon */}
        <g
          style={{
            animation: mounted ? "gentleDrift2 7s ease-in-out infinite" : "none",
            transformOrigin: "400px 750px",
          }}
        >
          <polygon
            points="400,720 420,732 420,756 400,768 380,756 380,732"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1.2"
            fill="rgba(255,255,255,0.015)"
          />
        </g>
      </svg>

      {/* Center content */}
      <div className="relative z-10 text-center px-8">
        {/* Logo mark - large artistic "有" */}
        <div
          className="relative mx-auto mb-8 select-none"
          style={{
            animation: mounted ? "logoPulse 4s ease-in-out infinite" : "none",
          }}
        >
          {/* Outer glow ring */}
          <div className="absolute inset-0 size-28 -m-4 rounded-full bg-white/5 blur-2xl" />
          {/* The character */}
          <div className="relative size-28 rounded-3xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center backdrop-blur-sm">
            <span
              className="text-5xl font-bold text-white/90"
              style={{
                fontFamily: "var(--font-custom), serif",
                textShadow: "0 0 60px rgba(255,255,255,0.15)",
              }}
            >
              有
            </span>
          </div>
        </div>

        <h2
          className="text-2xl font-semibold text-white/80 mb-2 tracking-wide"
          style={{ fontFamily: "var(--font-custom), sans-serif" }}
        >
          有份
        </h2>
        <p className="text-sm text-white/35 tracking-widest uppercase">
          YouFen
        </p>

        {/* Decorative divider */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-white/[0.08]" />
          <div className="size-1 rounded-full bg-white/[0.15]" />
          <div className="h-px w-8 bg-white/[0.08]" />
        </div>

        <p className="mt-6 text-sm text-white/25 leading-relaxed max-w-52">
          让每个参与者真正有份
        </p>
      </div>

      {/* Animation keyframes injected via style tag */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes orbFloat1 {
              0%, 100% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(30px, -20px) scale(1.05); }
              66% { transform: translate(-15px, 10px) scale(0.97); }
            }
            @keyframes orbFloat2 {
              0%, 100% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(-25px, 15px) scale(1.04); }
              66% { transform: translate(20px, -10px) scale(0.96); }
            }
            @keyframes orbFloat3 {
              0%, 100% { transform: translate(0, 0) scale(1); }
              50% { transform: translate(-10px, -15px) scale(1.08); }
            }
            @keyframes gentleDrift1 {
              0%, 100% { transform: translate(0, 0) rotate(0deg); }
              50% { transform: translate(8px, -6px) rotate(2deg); }
            }
            @keyframes gentleDrift2 {
              0%, 100% { transform: translate(0, 0) rotate(0deg); }
              50% { transform: translate(-6px, 8px) rotate(-1.5deg); }
            }
            @keyframes gentleDrift3 {
              0%, 100% { transform: translate(0, 0) rotate(0deg); }
              50% { transform: translate(5px, 10px) rotate(2.5deg); }
            }
            @keyframes logoPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.03); }
            }
          `,
        }}
      />
    </div>
  )
}
