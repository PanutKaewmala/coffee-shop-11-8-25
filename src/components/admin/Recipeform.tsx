"use client";

import { useState, useEffect, useMemo } from "react";
import { Recipe, Ingredient, MenuItem } from "@/lib/types";
import { Button } from "@/components/ui/button";

import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";

interface Props {
    menuItems: MenuItem[];
    ingredients: Ingredient[];
    initialData: Recipe | null;
    onSave: (values: Partial<Recipe>) => void;
    onClose: () => void;
}

function normalizeQtyString(raw: string): string {
    const s = raw.trim();
    if (s === "" || s === ".") return "";
    // strip leading zeros (keep "0.x" safe)
    // e.g. "01" -> "1", "00012" -> "12", "01.5" -> "1.5"
    if (/^0+\d/.test(s)) return String(Number(s));
    return s;
}

function parsePositiveQty(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
    const s = raw.trim();
    if (s === "" || s === ".") return { ok: false, reason: "กรุณากรอกจำนวน" };
    const n = Number(s);
    if (!Number.isFinite(n)) return { ok: false, reason: "จำนวนไม่ถูกต้อง" };
    if (n <= 0) return { ok: false, reason: "ต้องมากกว่า 0" };
    return { ok: true, value: n };
}

export default function RecipeForm({
    menuItems,
    ingredients,
    initialData,
    onSave,
    onClose,
}: Props) {
    const [menuId, setMenuId] = useState(initialData?.menu_id ?? "");
    const [ingredientId, setIngredientId] = useState(initialData?.ingredient_id ?? "");

    // ✅ P1: quantity as string (allow "")
    const [quantity, setQuantity] = useState<string>(
        initialData?.quantity ? String(initialData.quantity) : ""
    );

    // simple inline error for UX
    const [error, setError] = useState<string | null>(null);

    // label for unit/helper
    const unitLabel = useMemo(() => {
        const ing = ingredients.find((i) => i.id === ingredientId);
        return ing?.unit ? String(ing.unit) : null;
    }, [ingredients, ingredientId]);

    // Auto-select default values when adding
    useEffect(() => {
        if (!initialData) {
            queueMicrotask(() => {
                if (!menuId && menuItems.length) setMenuId(menuItems[0].id);
                if (!ingredientId && ingredients.length) setIngredientId(ingredients[0].id);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData, menuItems, ingredients]);

    // clear error when user changes fields
    useEffect(() => {
        if (error) setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menuId, ingredientId, quantity]);

    const handleSubmit = () => {
        if (!menuId) return setError("กรุณาเลือกเมนู");
        if (!ingredientId) return setError("กรุณาเลือกวัตถุดิบ");

        const parsed = parsePositiveQty(quantity);
        if (!parsed.ok) return setError(parsed.reason);

        onSave({
            menu_id: menuId,
            ingredient_id: ingredientId,
            quantity: parsed.value,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-surface text-text-primary p-6 rounded-2xl w-full max-w-md shadow-xl border border-text-muted/20">
                <h2 className="text-xl font-semibold mb-4">
                    {initialData ? "Edit Recipe" : "Add Recipe"}
                </h2>

                <div className="space-y-4">
                    {/* Menu */}
                    <div>
                        <label className="block mb-1 font-medium text-text-secondary">
                            Menu
                        </label>

                        <Select value={menuId} onValueChange={setMenuId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select menu" />
                            </SelectTrigger>

                            <SelectContent>
                                {menuItems.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Ingredient */}
                    <div>
                        <label className="block mb-1 font-medium text-text-secondary">
                            Ingredient
                        </label>

                        <Select value={ingredientId} onValueChange={setIngredientId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select ingredient" />
                            </SelectTrigger>

                            <SelectContent>
                                {ingredients.map((i) => (
                                    <SelectItem key={i.id} value={i.id}>
                                        {i.name} {i.unit ? `(${i.unit})` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Quantity */}
                    <div>
                        <label className="block mb-1 font-medium text-text-secondary">
                            Quantity (per drink)
                        </label>

                        <input
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            onBlur={() => setQuantity((prev) => normalizeQtyString(prev))}
                            inputMode="decimal"
                            pattern="[0-9]*[.,]?[0-9]*"
                            placeholder="เช่น 30"
                            className="
                                w-full p-2 rounded-lg
                                bg-background
                                border border-text-muted/40
                                text-text-primary
                                focus:outline-none focus:border-accent
                            "
                        />

                        <div className="mt-1 text-xs text-text-secondary">
                            ต้องมากกว่า 0{unitLabel ? ` • หน่วย: ${unitLabel}` : ""}
                        </div>

                        {error ? (
                            <div className="mt-2 text-sm text-red-400">
                                {error}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button onClick={handleSubmit}>
                        {initialData ? "Update" : "Save"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
