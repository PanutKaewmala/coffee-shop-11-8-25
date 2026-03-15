"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------
 * ROOT
 * --------------------------------------------- */
export const Select = SelectPrimitive.Root;

/* ---------------------------------------------
 * TRIGGER (ปุ่มกดหลัก)
 * --------------------------------------------- */
export const SelectTrigger = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        suppressHydrationWarning
        className={cn(
            "relative w-full flex justify-between items-center px-3 py-2 rounded-md",
            "border border-border/40 bg-card text-text-primary",
            "focus:outline-none focus:ring-1 focus:ring-accent",
            "cursor-pointer",
            className
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 opacity-70" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

/* ---------------------------------------------
 * CONTENT (ตัว dropdown)
 * --------------------------------------------- */
export const SelectContent = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            ref={ref}
            sideOffset={6}
            position="popper"
            className={cn(
                "z-[9999] min-w-[8rem] overflow-hidden rounded-md shadow-xl",
                "border border-border/40 bg-[var(--surface)]", // ← ใช้พื้นหลังทึบ
                "animate-in fade-in-0 zoom-in-95",
                className
            )}
            {...props}
        >
            <SelectPrimitive.ScrollUpButton className="flex items-center justify-center h-6 bg-[var(--surface)]">
                <ChevronUp className="h-4 w-4" />
            </SelectPrimitive.ScrollUpButton>

            <SelectPrimitive.Viewport className="p-1">
                {children}
            </SelectPrimitive.Viewport>

            <SelectPrimitive.ScrollDownButton className="flex items-center justify-center h-6 bg-[var(--surface)]">
                <ChevronDown className="h-4 w-4" />
            </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

/* ---------------------------------------------
 * ITEM (รายการแต่ละแถว)
 * --------------------------------------------- */
export const SelectItem = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        ref={ref}
        className={cn(
            "relative flex items-center px-3 py-2 rounded-md cursor-pointer",
            "text-text-primary",
            "focus:outline-none focus:bg-surface-hover",
            "data-[state=checked]:bg-accent/20 data-[state=checked]:text-accent",
            className
        )}
        {...props}
    >
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

/* ---------------------------------------------
 * VALUE (ข้อความที่เลือกแล้ว ใน Trigger)
 * --------------------------------------------- */
export const SelectValue = SelectPrimitive.Value;
