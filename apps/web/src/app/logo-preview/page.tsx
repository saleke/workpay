"use client";

import React, { useState } from "react";
import {
  LogoConcept1,
  LogoConcept2,
  LogoConcept3,
  LogoConcept4,
  LogoConcept5,
  WorkPayLogo,
} from "@/components/brand/logo";

export default function LogoPreviewPage() {
  const [selected, setSelected] = useState<number>(1);

  const concepts = [
    {
      id: 1,
      name: "Concept 1: Precision Apex",
      Component: LogoConcept1,
      description: "Dual-chevron geometric 'W' with crisp white stroke and emerald settlement payoff on dark squircle.",
    },
    {
      id: 2,
      name: "Concept 2: Amber Horizon",
      Component: LogoConcept2,
      description: "Editorial warm stone palette matching WorkPay's signature #B7792D amber token and dark charcoal tile.",
    },
    {
      id: 3,
      name: "Concept 3: Geometric Monolith",
      Component: LogoConcept3,
      description: "Solid polygonal facets inspired by Linear and Supabase. Zero strokes, pure geometric interlocking planes.",
    },
    {
      id: 4,
      name: "Concept 4: Interlocking Gradient",
      Component: LogoConcept4,
      description: "Unified continuous vector flow with subtle titanium-to-emerald gradient on dark slate.",
    },
    {
      id: 5,
      name: "Concept 5: Unboxed Minimalist Glyph",
      Component: LogoConcept5,
      description: "Ultra-clean wireframe glyph adapting to text color with precision emerald apex node.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#232323] p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <div className="border-b border-[#E7E5DF] pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#232323]">
                WorkPay Brand Logo Identity System
              </h1>
              <p className="text-sm text-[#6B6F76] mt-1">
                Mathematical vector SVG marks. No AI raster slop, no cheesy 3D glows. Pure typography and geometric balance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
                Vector Precision
              </span>
            </div>
          </div>
        </div>

        {/* Live Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {concepts.map((c) => {
            const Comp = c.Component;
            const isSelected = selected === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`p-6 rounded-xl bg-white border transition-all cursor-pointer ${
                  isSelected
                    ? "border-emerald-600 shadow-md ring-2 ring-emerald-500/20"
                    : "border-[#E7E5DF] hover:border-[#D6D3CC] shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-sm text-[#232323]">{c.name}</span>
                  {isSelected && (
                    <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">
                      Selected
                    </span>
                  )}
                </div>

                {/* Display Sizes */}
                <div className="bg-[#FAF9F5] p-6 rounded-lg border border-[#EBE8E1] flex flex-col items-center justify-center gap-6 mb-4">
                  <div className="flex items-center justify-center gap-8">
                    <div className="flex flex-col items-center gap-1.5">
                      <Comp size={64} />
                      <span className="text-[11px] font-mono text-[#8B8D91]">64px</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <Comp size={36} />
                      <span className="text-[11px] font-mono text-[#8B8D91]">36px</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <Comp size={24} />
                      <span className="text-[11px] font-mono text-[#8B8D91]">24px</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <Comp size={16} />
                      <span className="text-[11px] font-mono text-[#8B8D91]">16px</span>
                    </div>
                  </div>

                  {/* Dark Mode Tile */}
                  <div className="w-full bg-[#18181B] p-4 rounded-md flex items-center justify-between text-white">
                    <div className="flex items-center gap-3">
                      <Comp size={28} />
                      <span className="font-bold tracking-tight text-sm">WorkPay</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">Dark Nav</span>
                  </div>

                  {/* Light Mode Tile */}
                  <div className="w-full bg-white p-4 rounded-md border border-[#E7E5DF] flex items-center justify-between text-[#232323]">
                    <div className="flex items-center gap-3">
                      <Comp size={28} />
                      <span className="font-bold tracking-tight text-sm">WorkPay</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">Light Nav</span>
                  </div>
                </div>

                <p className="text-xs text-[#6B6F76] leading-relaxed">{c.description}</p>
              </div>
            );
          })}
        </div>

        {/* Selected Highlight & Navbar Simulation */}
        <div className="bg-white p-8 rounded-xl border border-[#E7E5DF] shadow-sm space-y-6">
          <div className="border-b border-[#E7E5DF] pb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#232323]">
              Navigation Header Simulation (Concept {selected})
            </h2>
            <span className="text-xs text-[#6B6F76]">Real-world 52px sticky navbar context</span>
          </div>

          <div className="border border-[#E7E5DF] rounded-lg overflow-hidden">
            <div className="bg-white/95 border-b border-[#E7E5DF] px-6 py-3 flex items-center justify-between">
              <WorkPayLogo variant={selected as any} size={28} />
              <div className="flex items-center gap-6 text-sm text-[#6B6F76] font-medium">
                <span className="text-[#232323] font-semibold">Tasks</span>
                <span>Payments</span>
                <span>Activity</span>
                <span>Work Studio</span>
                <span>Settings</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-md border border-zinc-200">
                  walter@workpay
                </span>
              </div>
            </div>
            <div className="bg-[#FAF9F5] p-12 text-center text-[#8B8D91] text-xs">
              Page content preview canvas
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
