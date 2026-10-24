import React from "react";
import { cn } from "@/lib/utils";

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Concept 1: "The Precision Apex"
 * Crisp, modern dual-chevron geometric W with emerald settlement accent.
 * Works seamlessly on dark squircle or transparent background.
 */
export function LogoConcept1({ size = 32, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#18181B" />
      {/* Left stroke: pure white */}
      <path
        d="M6.5 11.5L11.5 22.5L16 14.5"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right stroke: emerald settlement */}
      <path
        d="M16 14.5L20.5 22.5L25.5 11.5"
        stroke="#10B981"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Concept 2: "The Amber Horizon"
 * WorkPay editorial palette: Deep charcoal tile with warm amber payoff accent.
 * Reflects WorkPay's signature #B7792D brass/gold design token.
 */
export function LogoConcept2({ size = 32, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#1C1917" />
      {/* Left chevron: warm off-white */}
      <path
        d="M7 11L11.8 22L16 14"
        stroke="#F5F5F4"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right chevron: signature warm amber */}
      <path
        d="M16 14L20.2 22L25 11"
        stroke="#D97706"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Micro settlement node */}
      <circle cx="20.2" cy="22" r="1.5" fill="#F59E0B" />
    </svg>
  );
}

/**
 * Concept 3: "The Geometric Monolith" (Linear/Supabase style)
 * Two interlocking solid geometric facets forming a modern architectural W.
 * Zero strokes: 100% solid vector geometry with chamfered precision.
 */
export function LogoConcept3({ size = 32, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#09090B" />
      {/* Left Wing Facet */}
      <path
        d="M7 10H10.5L14 19L11.8 23L7 10Z"
        fill="#FFFFFF"
      />
      {/* Center Left Bridge */}
      <path
        d="M11.8 23L14 19L16 23.5L13.8 23.5L11.8 23Z"
        fill="#A1A1AA"
      />
      {/* Center Right Bridge */}
      <path
        d="M16 23.5L18 19L20.2 23L16 23.5Z"
        fill="#059669"
      />
      {/* Right Wing Facet */}
      <path
        d="M21.5 10H25L20.2 23L18 19L21.5 10Z"
        fill="#10B981"
      />
    </svg>
  );
}

/**
 * Concept 4: "The Interlocking Prisms" (Stripe / Vercel style)
 * Clean, bold parallel bars at a 60-degree angle.
 * Ultra-readable at 16px favicon scale.
 */
export function LogoConcept4({ size = 32, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#18181B" />
      {/* Parallel diagonal bands forming W */}
      <path
        d="M7.5 11L12.5 22.5M12.5 22.5L16 15M16 15L19.5 22.5M19.5 22.5L24.5 11"
        stroke="url(#wp-grad-4)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="wp-grad-4" x1="7" y1="11" x2="25" y2="22.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#E4E4E7" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Concept 5: "The Pure Minimalist Glyph" (Unboxed)
 * Modern tech style: No background box, adapts directly to surrounding text and theme.
 */
export function LogoConcept5({ size = 32, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      {...props}
    >
      <path
        d="M3 6L7.5 18L12 8L16.5 18L21 6"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="8" r="1.75" fill="#10B981" />
    </svg>
  );
}

/**
 * Standard WorkPay Brand Wordmark + Logo
 */
export function WorkPayLogo({
  size = 28,
  showWordmark = true,
  className,
  variant = 1,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  variant?: 1 | 2 | 3 | 4 | 5;
}) {
  const LogoMark =
    variant === 2
      ? LogoConcept2
      : variant === 3
        ? LogoConcept3
        : variant === 4
          ? LogoConcept4
          : variant === 5
            ? LogoConcept5
            : LogoConcept1;

  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span className="font-bold tracking-tight text-lg text-foreground flex items-center gap-1">
          <span>WorkPay</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
    </div>
  );
}

export const WorkPayLogoMark = LogoConcept1;
