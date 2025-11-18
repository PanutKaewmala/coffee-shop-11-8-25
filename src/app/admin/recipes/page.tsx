"use client";

import { useEffect, useState } from "react";
import { Recipe, Ingredient, MenuItem } from "@/lib/types";

import Card from "@/components/admin/Card";
import { Button } from "@/components/ui/button";
import RecipeTable from "@/components/admin/RecipeTable";
import RecipeForm from "@/components/admin/Recipeform";


export default function RecipesPage() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<Recipe | null>(null);

    /* -----------------------------
     * Fetch Recipes + Ingredients + Menus
     * ----------------------------- */
    const fetchAll = async () => {
        try {
            setLoading(true);

            const [r, i, m] = await Promise.all([
                fetch("/api/recipes").then((r) => r.json()),
                fetch("/api/ingredients").then((r) => r.json()),
                fetch("/api/menu").then((r) => r.json()),
            ]);

            setRecipes(r);
            setIngredients(i);
            setMenuItems(Array.isArray(m) ? m : m.menu || []);
        } catch (err) {
            console.error("fetchAll error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        queueMicrotask(fetchAll);
    }, []);

    /* -----------------------------
     * Open Form
     * ----------------------------- */
    const openForm = (item?: Recipe) => {
        setEditingItem(item ?? null);
        setShowForm(true);
    };

    const closeForm = () => setShowForm(false);

    /* -----------------------------
     * Save (POST / PUT)
     * ----------------------------- */
    const saveRecipe = async (payload: Partial<Recipe>) => {
        const method = editingItem ? "PUT" : "POST";

        await fetch("/api/recipes", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                editingItem
                    ? { ...payload, id: editingItem.id }
                    : payload
            ),
        });

        closeForm();
        fetchAll();
    };

    /* -----------------------------
     * Delete
     * ----------------------------- */
    const deleteRecipe = async (id: string) => {
        if (!confirm("Delete this recipe?")) return;

        await fetch(`/api/recipes?id=${id}`, {
            method: "DELETE",
        });

        fetchAll();
    };

    /* -----------------------------
     * Render
     * ----------------------------- */
    return (
        <div className="p-6 space-y-6">
            <Card title="Recipe Management">
                <div className="flex justify-end mb-4">
                    <Button onClick={() => openForm()}>+ Add Recipe</Button>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <RecipeTable
                        recipes={recipes}
                        ingredients={ingredients}
                        menuItems={menuItems}
                        onEdit={openForm}
                        onDelete={deleteRecipe}
                    />
                )}
            </Card>

            {showForm && (
                <RecipeForm
                    ingredients={ingredients}
                    menuItems={menuItems}
                    initialData={editingItem}
                    onSave={saveRecipe}
                    onClose={closeForm}
                />
            )}
        </div>
    );
}
