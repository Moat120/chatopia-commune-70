import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { playClickSound } from "@/hooks/useSound";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[13px] font-semibold",
    "ring-offset-background transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40",
    // iOS press feedback
    "active:scale-[0.97] active:brightness-90",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        default: cn(
          "bg-primary text-primary-foreground rounded-xl",
          "shadow-[0_2px_12px_hsl(var(--primary)/0.25)]",
          "hover:shadow-[0_4px_20px_hsl(var(--primary)/0.35)] hover:brightness-110",
        ),
        destructive: cn(
          "bg-destructive text-destructive-foreground rounded-xl",
          "shadow-[0_2px_12px_hsl(var(--destructive)/0.25)]",
          "hover:shadow-[0_4px_20px_hsl(var(--destructive)/0.35)]",
        ),
        outline: cn(
          "rounded-xl border border-foreground/[0.1] bg-foreground/[0.04]",
          "hover:bg-foreground/[0.08] hover:border-foreground/[0.15]",
          "backdrop-blur-sm",
        ),
        secondary: cn(
          "bg-foreground/[0.06] text-foreground rounded-xl",
          "hover:bg-foreground/[0.1]",
        ),
        ghost: cn(
          "rounded-xl",
          "hover:bg-foreground/[0.06]",
        ),
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2.5 rounded-xl",
        sm: "h-9 px-3.5 rounded-lg",
        lg: "h-12 px-8 rounded-xl text-[14px]",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Set to true to suppress the click sound */
  silent?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, silent = false, onClick, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!silent) {
          playClickSound();
        }
        onPointerDown?.(e);
      },
      [onPointerDown, silent],
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerDown={handlePointerDown as any}
        onClick={onClick}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
