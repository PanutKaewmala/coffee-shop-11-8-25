"use client";

import { useState, useEffect } from "react";
import { Recipe, Ingredient, MenuItem } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Props {
    menuItems: MenuItem[];
    ingredients: Ingredient[];
    initialData: Recipe | null;
    onSave: (values: Partial<Recipe>) => void;
    onClose: () => void;
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
    const [quantity, setQuantity] = useState<number>(initialData?.quantity ?? 0);

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

    const handleSubmit = () => {
        if (!menuId || !ingredientId || quantity <= 0) return;

        onSave({
            menu_id: menuId,
            ingredient_id: ingredientId,
            quantity,
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
                        <label htmlFor="menu" className="block mb-1 font-medium text-text-secondary">
                            Menu
                        </label>

                        <select
                            id="menu"
                            value={menuId}
                            onChange={(e) => setMenuId(e.target.value)}
                            className="
                                w-full p-2 rounded-lg 
                                bg-background
                                border border-text-muted/40
                                text-text-primary
                                focus:outline-none focus:border-accent
                            "
                        >
                            {menuItems.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Ingredient */}
                    <div>
                        <label htmlFor="ingredient" className="block mb-1 font-medium text-text-secondary">
                            Ingredient
                        </label>

                        <select
                            id="ingredient"
                            value={ingredientId}
                            onChange={(e) => setIngredientId(e.target.value)}
                            className="
                                w-full p-2 rounded-lg 
                                bg-background
                                border border-text-muted/40
                                text-text-primary
                                focus:outline-none focus:border-accent
                            "
                        >
                            {ingredients.map((i) => (
                                <option key={i.id} value={i.id}>
                                    {i.name} ({i.unit})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Quantity */}
                    <div>
                        <label htmlFor="quantity" className="block mb-1 font-medium text-text-secondary">
                            Quantity (per drink)
                        </label>
                        <input
                            id="quantity"
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="
                                w-full p-2 rounded-lg
                                bg-background
                                border border-text-muted/40
                                text-text-primary
                                focus:outline-none focus:border-accent
                            "
                        />
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
