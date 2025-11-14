"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "ghost" | "destructive"; // ✅ เพิ่ม destructive
    size?: "sm" | "md" | "lg";
}

export function Button({
    className,
    variant = "default",
    size = "md",
    ...props
}: ButtonProps) {
    const base =
        "inline-flex items-center justify-center font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        default: "bg-primary text-white hover:bg-primary/90 focus:ring-primary",
        outline:
            "border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800",
        ghost:
            "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
        destructive:
            "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500", // ✅ สีแดงสำหรับลบ
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
