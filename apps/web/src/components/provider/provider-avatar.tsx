"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function ProviderAvatar({
  displayName,
  image,
  className,
}: {
  displayName: string;
  image?: string | null;
  className?: string;
}) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <Avatar
      className={cn("border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]", className)}
    >
      {image ? <AvatarImage src={image} alt={`${displayName} profile photo`} /> : null}
      <AvatarFallback className="bg-[var(--wp-surface-subtle)] text-sm font-semibold text-[var(--wp-text-primary)]">
        {initials || "W"}
      </AvatarFallback>
    </Avatar>
  );
}
