"use client";

import { useState } from "react";
import { StaggerTestimonials } from "./stagger-testimonials";

export function ComponentPreview() {
  const [activeTab, setActiveTab] = useState("usage");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const usageCode = `import { StaggerTestimonials } from "@/components/ui/stagger-testimonials";

const DemoOne = () => {
  return (
    <div className="flex w-full h-screen justify-center items-center">
      <StaggerTestimonials />
    </div>
  );
};

export { DemoOne };`;

  const handleCopy = () => {
    navigator.clipboard.writeText(usageCode);
  };

  return (
    <section className="mt-8 flex flex-col gap-1.5 border-[0.5px] border-blue-200 bg-blue-50/40 p-1.5 rounded-lg">
      {/* Preview Area */}
      <div
        tabIndex={-1}
        className="relative w-full overflow-clip border-[0.5px] border-blue-200 bg-white shadow-sm outline-none h-[min(85vh,46rem)] rounded-md"
      >
        {/* Control Buttons */}
        <section className="absolute left-3 top-3 z-30 select-none gap-px rounded-[4px] border-[0.5px] border-blue-200/40 p-1 backdrop-blur bg-white/80">
          <div className="flex items-center gap-px justify-start">
            {/* Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap text-sm font-medium duration-150 active:scale-[0.97] outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500/70 disabled:opacity-50 disabled:pointer-events-none rounded-md h-7 px-2 hover:bg-blue-100 transition-colors rounded-l-[3px] rounded-r-none text-gray-700"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" clipRule="evenodd" d="M1 5.25V6H2.5V5.25V2.5H5.25H6V1H5.25H2C1.44772 1 1 1.44772 1 2V5.25ZM5.25 14.9994H6V13.4994H5.25H2.5V10.7494V9.99939H1V10.7494V13.9994C1 14.5517 1.44772 14.9994 2 14.9994H5.25ZM15 10V10.75V14C15 14.5523 14.5523 15 14 15H10.75H10V13.5H10.75H13.5V10.75V10H15ZM10.75 1H10V2.5H10.75H13.5V5.25V6H15V5.25V2C15 1.44772 14.5523 1 14 1H10.75Z" />
              </svg>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap text-sm font-medium duration-150 active:scale-[0.97] h-7 px-2 hover:bg-blue-100 transition-colors rounded-none text-gray-700"
            >
              <div className="relative">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" className="w-4 h-4">
                  <g transform="scale(1.05)">
                    <path fillRule="evenodd" clipRule="evenodd" d="M8.06207 1.68681C8.19154 1.90981 8.18081 2.18749 8.03446 2.39981C7.59054 3.04388 7.33074 3.82385 7.33074 4.66651C7.33074 6.87566 9.12159 8.66651 11.3307 8.66651C12.1734 8.66651 12.9535 8.40668 13.5975 7.96274C13.8099 7.81641 14.0875 7.80559 14.3105 7.93506C14.5336 8.06454 14.6619 8.31093 14.6401 8.56793C14.3509 11.9830 11.4883 14.6640 7.99874 14.6640C4.31755 14.6640 1.33333 11.6798 1.33333 7.99861C1.33333 4.50915 4.01427 1.64657 7.42919 1.35721C7.68619 1.33543 7.93259 1.46379 8.06207 1.68681ZM6.28002 2.94944C4.17867 3.66452 2.66667 5.65523 2.66667 7.99861C2.66667 10.9434 5.05421 13.3307 7.99874 13.3307C10.3422 13.3307 12.3329 11.8186 13.0479 9.71713C12.5088 9.90041 11.9311 9.99984 11.3307 9.99984C8.38516 9.99984 5.99741 7.61209 5.99741 4.66651C5.99741 4.06621 6.09679 3.48853 6.28002 2.94944Z" fill="currentColor" />
                  </g>
                </svg>
              </div>
            </button>

            {/* Refresh Button */}
            <button
              className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap text-sm font-medium duration-150 active:scale-[0.97] rounded-md h-7 px-2 hover:bg-blue-100 transition-colors rounded-r-[3px] rounded-l-none text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>
        </section>

        {/* Preview Content */}
        <div className="h-full w-full relative overflow-hidden">
          <div className="relative flex-grow h-full overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
            <div className="w-full h-full flex items-center justify-center p-8">
              <StaggerTestimonials />
            </div>
          </div>
        </div>
      </div>

      {/* Code Display Area */}
      <div className="w-full overflow-hidden border-[0.5px] border-blue-200 bg-white rounded-md">
        {/* Tab Bar */}
        <div className="flex items-center justify-between gap-4 border-b-[0.5px] border-blue-200 px-2 py-1.5">
          <div role="tablist" aria-label="Source" className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "usage"}
              onClick={() => setActiveTab("usage")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeTab === "usage"
                  ? "bg-blue-100 text-blue-900"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Usage.tsx
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "component"}
              onClick={() => setActiveTab("component")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeTab === "component"
                  ? "bg-blue-100 text-blue-900"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Component.tsx
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-gray-500">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap font-medium duration-150 active:scale-[0.97] bg-blue-50 text-blue-900 border border-blue-200 shadow-sm hover:bg-blue-100 px-3 h-7 shrink-0 gap-1.5 rounded-lg text-xs transition-all"
            type="button"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
              <path d="M8 5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5V7H8V5Z" />
              <path d="M16 5H18C19.1046 5 20 5.89543 20 7V11M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H12" />
              <path d="M16.0858 15L14.2929 16.7929C13.9024 17.1834 13.9024 17.8166 14.2929 18.2071L16.0858 20M20.0858 15L21.8787 16.7929C22.2692 17.1834 22.2692 17.8166 21.8787 18.2071L20.0858 20" />
            </svg>
            Copy
          </button>
        </div>

        {/* Code Block */}
        <div className="w-full !m-0 !rounded-none !bg-transparent !p-4 relative">
          <pre className="font-mono text-sm overflow-auto max-h-[26rem] bg-gradient-to-br from-slate-50 to-blue-50 p-4 rounded-md border border-blue-100">
            <code className="text-gray-800 leading-relaxed">
              {usageCode}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}
