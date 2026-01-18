"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import IngredientCombobox from "@/components/admin/ingredients/IngredientCombobox";
import type { Ingredient } from "@/lib/types";
import type { VariantOption } from "./RecipesShell";

type UUID = string;

type EditDraft = {
    id?: UUID;
    variant_id: UUID;
    ingredient_id: UUID;
    quantity: number;
};

function sanitizeDecimalInput(raw: string): string {
    const v = raw.replace(",", ".").trim();
    if (v === "") return "";
    if (!/^\d*\.?\d*$/.test(v)) return "";
    return v;
}
function parsePositiveNumber(raw: string): number | null {
    if (!raw.trim()) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    if (n > 999999) return null;
    return n;
}
function displayVariantLabel(full: string): string {
    const parts = full.split("•").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) return full;
    return parts.slice(1).join(" • ");
}

export default function AddIngredientModal({
    open,
    onClose,
    mode,
    draft,
    setDraft,
    variantsForMenu,
    ingredients,
    disabledIds,
    recentIds,
    onPickRecent,
    onSave,
    lockIngredient,
}: {
    open: boolean;
    onClose: () => void;

    mode: "add" | "edit";
    draft: EditDraft;
    setDraft: (next: EditDraft) => void;

    variantsForMenu: VariantOption[];
    ingredients: Ingredient[];

    disabledIds: Set<string>;
    recentIds: string[];
    onPickRecent: (id: string) => void;

    onSave: (payload: { id?: string; variant_id: string; ingredient_id: string; quantity: number }) => void;
    lockIngredient?: boolean;
}) {
    const [qtyInput, setQtyInput] = useState(String(draft.quantity ?? 1));

    const isAdd = mode === "add";
    const duplicateSelected = isAdd && draft.ingredient_id ? disabledIds.has(draft.ingredient_id) : false;

    const variantLabelById = useMemo(
        () => new Map(variantsForMenu.map((v) => [v.variant_id, v.label])),
        [variantsForMenu]
    );

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] border border-[var(--text-muted)]/20 shadow-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg font-semibold">{isAdd ? "Add Ingredient" : "Edit Ingredient"}</div>
                </div>

                <label className="block text-sm text-[var(--text-muted)] mb-1">Variant</label>
                <select
                    className="w-full p-2 rounded-lg bg-background border border-text-muted/40 mb-3"
                    value={draft.variant_id}
                    onChange={(e) => setDraft({ ...draft, variant_id: e.target.value })}
                >
                    {variantsForMenu.map((v) => (
                        <option key={v.variant_id} value={v.variant_id}>
                            {displayVariantLabel(v.label)} {v.is_default ? "(default)" : ""}
                        </option>
                    ))}
                </select>

                <label className="block text-sm text-[var(--text-muted)] mb-1">Ingredient</label>
                {lockIngredient ? (
                    <div className="mb-2 rounded-lg border border-[var(--text-muted)]/25 px-3 py-2 text-sm">
                        {draft.ingredient_id}
                        <span className="ml-2 text-xs text-[var(--text-secondary)]">(แก้จำนวนอย่างเดียว)</span>
                    </div>
                ) : (
                    <div className="mb-2">
                        <IngredientCombobox
                            ingredients={ingredients}
                            value={draft.ingredient_id}
                            onChange={(id: string) => {
                                setDraft({ ...draft, ingredient_id: id });
                                if (id) onPickRecent(id);
                            }}
                            disabledIds={disabledIds}
                            recentIds={recentIds}
                            onPickRecent={onPickRecent}
                            emptyHint="ไม่เจอวัตถุดิบ — ไปเพิ่มที่ Ingredients"
                        />
                    </div>
                )}

                {duplicateSelected ? (
                    <div className="mb-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm">
                        วัตถุดิบนี้มีในสูตรแล้ว — กด Save แล้วระบบจะ <b>อัปเดตจำนวน</b> ให้ (ไม่เพิ่มซ้ำ)
                    </div>
                ) : null}

                <label className="block text-sm text-[var(--text-muted)] mb-1">Quantity (per drink)</label>
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="เช่น 1, 0.5, 12.5"
                    className="w-full p-2 rounded-lg bg-background border border-text-muted/40 mb-2"
                    value={qtyInput}
                    onChange={(e) => {
                        if (e.target.value.trim() === "") {
                            setQtyInput("");
                            return;
                        }
                        const cleaned = sanitizeDecimalInput(e.target.value);
                        if (cleaned !== "") setQtyInput(cleaned);
                    }}
                    onBlur={() => setQtyInput((v) => v.trim())}
                />
                <div className="text-xs text-[var(--text-secondary)] mb-4">
                    ระบบจะเช็คตอนกด Save ว่าต้องมากกว่า 0
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            const qty = parsePositiveNumber(qtyInput);
                            if (!draft.variant_id || !draft.ingredient_id || qty == null) {
                                alert("กรอกให้ครบ: variant + วัตถุดิบ + quantity (>0)");
                                return;
                            }
                            onSave({
                                id: draft.id,
                                variant_id: draft.variant_id,
                                ingredient_id: draft.ingredient_id,
                                quantity: qty,
                            });
                        }}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
