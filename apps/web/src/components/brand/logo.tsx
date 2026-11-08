import type { HTMLAttributes, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type TenfoMarkMode = "brand" | "flat" | "mono";

export interface TenfoMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
  mode?: TenfoMarkMode;
}

export interface TenfoLogoProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  size?: number;
  showWordmark?: boolean;
  markMode?: TenfoMarkMode;
  markClassName?: string;
  wordmarkClassName?: string;
}

/**
 * Common Datum: two independent parties aligned by an explicit shared record.
 * The permanent gaps preserve the distinction between discussion and consent.
 */
export function TenfoMark({ size = 32, mode = "brand", className, ...props }: TenfoMarkProps) {
  const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);
  const partyColor = mode === "brand" ? "#FCF9F1" : "currentColor";
  const recordColor = mode === "mono" ? "currentColor" : "#91C94E";
  const opticalMicroMark = size <= 20;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      focusable="false"
      {...props}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : props.role}
    >
      {mode === "brand" ? <rect width="32" height="32" rx="7.5" fill="#174B35" /> : null}
      {opticalMicroMark ? (
        <>
          <path
            d="M6.5 7H13.5C14.3284 7 15 7.67157 15 8.5V12.5L13.5 14H6.5C5.67157 14 5 13.3284 5 12.5V8.5C5 7.67157 5.67157 7 6.5 7Z"
            fill={partyColor}
          />
          <path
            d="M18.5 7H25.5C26.3284 7 27 7.67157 27 8.5V12.5C27 13.3284 26.3284 14 25.5 14H18.5L17 12.5V8.5C17 7.67157 17.6716 7 18.5 7Z"
            fill={partyColor}
          />
          <rect x="13" y="16" width="6" height="11" rx="1.25" fill={recordColor} />
        </>
      ) : (
        <>
          <path
            d="M7 7.25H14C14.8284 7.25 15.5 7.92157 15.5 8.75V12.25L14 13.75H7C6.17157 13.75 5.5 13.0784 5.5 12.25V8.75C5.5 7.92157 6.17157 7.25 7 7.25Z"
            fill={partyColor}
          />
          <path
            d="M18 7.25H25C25.8284 7.25 26.5 7.92157 26.5 8.75V12.25C26.5 13.0784 25.8284 13.75 25 13.75H18L16.5 12.25V8.75C16.5 7.92157 17.1716 7.25 18 7.25Z"
            fill={partyColor}
          />
          <rect x="13.5" y="14.5" width="5" height="12" rx="1.25" fill={recordColor} />
        </>
      )}
    </svg>
  );
}

export function TenfoWordmark({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-block font-sans text-lg font-[760] leading-none tracking-[-0.035em]",
        className,
      )}
      {...props}
    >
      Tenfo
    </span>
  );
}

export function TenfoLogo({
  size = 28,
  showWordmark = true,
  markMode = "brand",
  markClassName,
  wordmarkClassName,
  className,
  ...props
}: TenfoLogoProps) {
  return (
    <span className={cn("inline-flex select-none items-center gap-2", className)} {...props}>
      <TenfoMark size={size} mode={markMode} className={markClassName} />
      {showWordmark ? <TenfoWordmark className={wordmarkClassName} /> : null}
    </span>
  );
}
