"use client"

import { useLocale } from "next-intl"
import { GrainGradient } from "@paper-design/shaders-react"

export function AuthVisual() {
  const locale = useLocale()
  const isZh = locale === "zh"

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <GrainGradient
        speed={1}
        scale={1}
        rotation={0}
        offsetX={0}
        offsetY={0}
        softness={1.2}
        intensity={0.3}
        noise={0.15}
        shape="corners"
        frame={2854.5}
        colors={["#E0F2FE", "#7DD3FC", "#2DD4BF", "#F0FDFA"]}
        colorBack="#00000000"
        className="absolute inset-0"
      />

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-8 sm:p-12">
        <h2 className="max-w-[620px] pt-0 text-5xl font-medium tracking-[-0.05em] text-white sm:text-6xl lg:pt-16 lg:text-[64px] lg:leading-[0.98] xl:text-[70px]">
          {isZh ? (
            <>
              让每个
              <br />
              参与者
              <br />
              真正有份儿
            </>
          ) : (
            <>
              Everyone
              <br />
              truly has
              <br />a stake
            </>
          )}
        </h2>

        <p className="text-lg text-white/60 sm:text-xl lg:text-2xl">
          {isZh ? "无代码社群共治平台" : "No-Code Community Governance"}
        </p>
      </div>
    </div>
  )
}
