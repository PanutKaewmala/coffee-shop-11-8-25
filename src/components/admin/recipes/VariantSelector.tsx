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
                เมนูนี้ยังไม่มีตัวเลือก
            </div>
        );
    }

    return (
        <div className="space-y-2" role="listbox" aria-label="ตัวเลือกสูตร">
            {variants.map((v) => (
                <button
                    key={v.variant_id}
                    type="button"
                    role="option"
                    aria-selected={value === v.variant_id}
                    disabled={disabled}
                    onClick={() => onChange(v.variant_id)}
                    className={[
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                        value === v.variant_id
                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                            : "border-text-muted/30 bg-background hover:border-[var(--text-muted)]/50",
                        disabled ? "cursor-not-allowed opacity-60" : "",
                    ].join(" ")}
                >
                    <span className="min-w-0 truncate">
                        {v.displayLabel || displayVariantLabel(v.label)}
                    </span>
                    <span
                        className={[
                            "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                            v.isReadyForPos
                                ? "border-[var(--accent)]/40 text-[var(--accent)]"
                                : "border-amber-400/40 text-amber-300",
                        ].join(" ")}
                    >
                        {v.isReadyForPos ? "พร้อมขาย" : "ยังไม่มีสูตร"}
                    </span>
                </button>
            ))}
        </div>
    );
}
