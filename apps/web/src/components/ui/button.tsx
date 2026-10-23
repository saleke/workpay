import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 ease-out select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--wp-text-primary)] text-white hover:bg-black shadow-xs hover:shadow-sm",
        destructive: "bg-[var(--wp-danger)] text-white hover:bg-[var(--wp-danger)]/90 shadow-xs",
        outline: "border border-[var(--wp-border)] bg-white text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] hover:border-[var(--wp-border-strong)] shadow-xs",
        secondary: "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] hover:bg-[var(--wp-border)]",
        ghost: "text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] hover:text-[var(--wp-text-primary)]",
        link: "text-[var(--wp-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-6",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
