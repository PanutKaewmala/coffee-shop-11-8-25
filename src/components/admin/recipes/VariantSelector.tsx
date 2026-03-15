"use client";

import type { VariantOption } from "./RecipesShell";

function displayVariantLabel(full: string): string {
    // full: "เมนู • ปั่น • L" -> แสดง "ปั่น • L"
    const parts = full.split("•").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) return full;
    return parts.slice(1).join(" • ");
}

export default function VariantSelector({
    variants,
    value,
    onChange,
    disabled,
}: {
    variants: VariantOption[];
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}) {
    if (variants.length === 0) {
        return (
            <div className="rounded-lg border border-[var(--text-muted)]/25 px-3 py-2 text-sm text-[var(--text-secondary)]">
                เมนูนี้ยังไม่มี Variant
            </div>
        );
    }

    return (
        <select
            className="w-full p-2 rounded-lg bg-background border border-text-muted/40"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        >
            {variants.map((v) => (
                <option key={v.variant_id} value={v.variant_id}>
                    {displayVariantLabel(v.label)}
                </option>
            ))}
        </select>
    );
}
