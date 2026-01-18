"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "ghost" | "destructive";
    size?: "sm" | "md" | "lg";
}

export function Button({
    className,
    variant = "default",
    size = "md",
    ...props
}: ButtonProps) {
    const base =
        "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all " +
        "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] " +
        "disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        /* ⭐ Primary — เหมือนตัวอย่าง: caramel + text ตามธีม */
        default: `
      bg-[var(--accent)]
      text-[var(--background)]
      shadow-sm
      hover:bg-[var(--accent-dark)]
      hover:-translate-y-[1px]
      active:translate-y-0
      active:scale-[0.98]
    `,

        /* ⭐ Soft button (ใช้กับ More / Add ใน filter ได้) */
        outline: `
      bg-[var(--surface)]
      text-[var(--text-primary)]
      border border-[var(--text-muted)]/25
      shadow-sm
      hover:bg-[var(--accent)]
      hover:text-[var(--background)]
      hover:border-transparent
      hover:-translate-y-[1px]
      active:translate-y-0
      active:scale-[0.98]
    `,

        /* ⭐ Ghost */
        ghost: `
      text-[var(--text-secondary)]
      hover:bg-[var(--surface)]
      hover:text-[var(--text-primary)]
      active:scale-[0.98]
    `,

        /* 🔥 Destructive */
        destructive: `
      bg-red-500 text-white
      hover:bg-red-600
      shadow-sm
      hover:-translate-y-[1px]
      active:translate-y-0
      active:scale-[0.98]
    `,
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-base",
        lg: "px-6 py-3 text-lg",
    };

    return (
        <button
            className={cn(base, variants[variant], sizes[size], className)}
            {...props}
        />
    );
}
