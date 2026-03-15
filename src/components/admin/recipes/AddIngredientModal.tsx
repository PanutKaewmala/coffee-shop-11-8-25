"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import IngredientCombobox from "@/components/admin/ingredients/IngredientCombobox";
import type { Ingredient } from "@/lib/types";
import { BASE_UNIT_LABEL } from "@/lib/units";
import type { VariantOption } from "./RecipesShell";

type UUID = string;

type EditDraft = {
    id?: UUID;
    variant_id: UUID;
    ingredient_id: UUID;
    quantity: number;
    ingredient_name?: string | null;
    ingredient_unit?: string | null;
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
    const parts = full
        .split(/•|โ€ข/g)
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length <= 1) return full;
    return parts.slice(1).join(" • ");
}

function unitLabelOf(ingredient: Ingredient | undefined): string {
    if (!ingredient) return "";
    if (ingredient.base_unit && ingredient.base_unit in BASE_UNIT_LABEL) {
        return BASE_UNIT_LABEL[ingredient.base_unit];
    }
    return (ingredient.unit ?? "").trim();
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
    const [qtyTouched, setQtyTouched] = useState(false);

    const isAdd = mode === "add";
    const duplicateSelected = isAdd && draft.ingredient_id ? disabledIds.has(draft.ingredient_id) : false;

    const selectedIngredient = ingredients.find((x) => x.id === draft.ingredient_id);
    const selectedIngredientName = selectedIngredient?.name ?? draft.ingredient_name ?? draft.ingredient_id;
    const selectedIngredientUnitLabel = unitLabelOf(selectedIngredient) || (draft.ingredient_unit ?? "").trim();

    const qty = parsePositiveNumber(qtyInput);
    const quantityError = qtyTouched && qty == null ? "Quantity must be greater than 0" : null;
    const canSave = Boolean(draft.variant_id && draft.ingredient_id && qty != null);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] border border-[var(--text-muted)]/20 shadow-xl p-5">
                <div className="mb-4 text-lg font-semibold">{isAdd ? "Add Ingredient" : "Edit Ingredient"}</div>

                <label className="mb-1 block text-sm text-[var(--text-muted)]">Variant</label>
                <select
                    className="mb-3 w-full rounded-lg border border-text-muted/40 bg-background p-2 disabled:cursor-not-allowed disabled:opacity-70"
                    value={draft.variant_id}
                    onChange={(e) => setDraft({ ...draft, variant_id: e.target.value })}
                    disabled={!isAdd}
                >
                    {variantsForMenu.map((v) => (
                        <option key={v.variant_id} value={v.variant_id}>
                            {displayVariantLabel(v.label)}
                        </option>
                    ))}
                </select>

                <label className="mb-1 block text-sm text-[var(--text-muted)]">Ingredient</label>
                {lockIngredient ? (
                    <div className="mb-3 rounded-lg border border-[var(--text-muted)]/25 px-3 py-2 text-sm">
                        <div className="font-medium">{selectedIngredientName}</div>
                    </div>
                ) : (
                    <div className="mb-3">
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
                            emptyHint="No ingredient found - create it in Ingredients first"
                        />
                    </div>
                )}

                {duplicateSelected ? (
                    <div className="mb-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm">
                        This ingredient already exists in this recipe. Saving will update quantity.
                    </div>
                ) : null}

                <label className="mb-1 block text-sm text-[var(--text-muted)]">Quantity (per drink)</label>
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 1, 0.5, 12.5"
                    className="mb-1 w-full rounded-lg border border-text-muted/40 bg-background p-2"
                    value={qtyInput}
                    onChange={(e) => {
                        if (e.target.value.trim() === "") {
                            setQtyInput("");
                            return;
                        }
                        const cleaned = sanitizeDecimalInput(e.target.value);
                        if (cleaned !== "") setQtyInput(cleaned);
                    }}
                    onBlur={() => {
                        setQtyTouched(true);
                        setQtyInput((v) => v.trim());
                    }}
                />
                {selectedIngredientUnitLabel ? (
                    <div className="mb-1 text-xs text-[var(--text-secondary)]">Unit: {selectedIngredientUnitLabel}</div>
                ) : null}
                {quantityError ? <div className="mb-2 text-xs text-red-400">{quantityError}</div> : null}

                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!canSave}
                        onClick={() => {
                            setQtyTouched(true);
                            if (!draft.variant_id || !draft.ingredient_id || qty == null) return;
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
