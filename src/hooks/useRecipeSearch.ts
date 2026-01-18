"use client";

import { useMemo } from "react";
import { Recipe, MenuItem, Ingredient } from "@/lib/types";

export default function useRecipeSearch(
    recipes: Recipe[],
    menuItems: MenuItem[],
    ingredients: Ingredient[],
    query: string
) {

    // map สำหรับ lookup ชื่อเมนูและวัตถุดิบ
    const menuMap = useMemo(
        () => Object.fromEntries(menuItems.map((m) => [m.id, m.name])),
        [menuItems]
    );

    const ingredientMap = useMemo(
        () =>
            Object.fromEntries(
                ingredients.map((i) => [i.id, i.name])
            ),
        [ingredients]
    );

    // ทำ lowercase ให้ search เร็วขึ้น
    const lowerQuery = query.toLowerCase();

    // search logic
    const filtered = useMemo(() => {
        if (!lowerQuery.trim()) return recipes;

        return recipes.filter((r) => {
            const menuName = (menuMap[r.menu_id] || "").toLowerCase();
            const ingName = (ingredientMap[r.ingredient_id] || "").toLowerCase();
            const qty = String(r.quantity || "").toLowerCase();

            return (
                menuName.includes(lowerQuery) ||
                ingName.includes(lowerQuery) ||
                qty.includes(lowerQuery)
            );
        });
    }, [recipes, menuMap, ingredientMap, lowerQuery]);

    return filtered;
}
