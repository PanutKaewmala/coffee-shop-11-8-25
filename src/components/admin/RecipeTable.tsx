import { Recipe, Ingredient, MenuItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import Table from "@/components/admin/Table";

interface Props {
    recipes: Recipe[];
    menuItems: MenuItem[];
    ingredients: Ingredient[];
    onEdit: (recipe: Recipe) => void;
    onDelete: (id: string) => void;
}

export default function RecipeTable({
    recipes,
    menuItems,
    ingredients,
    onEdit,
    onDelete,
}: Props) {
    const menuMap = Object.fromEntries(menuItems.map((m) => [m.id, m.name]));
    const ingredientMap = Object.fromEntries(
        ingredients.map((i) => [i.id, `${i.name} (${i.unit})`])
    );

    const headers = ["Menu", "Ingredient", "Quantity", "Actions"];

    const rows = recipes.map((r) => [
        menuMap[r.menu_id] ?? "—",
        ingredientMap[r.ingredient_id] ?? "—",
        r.quantity,
        <div key={r.id} className="flex gap-2">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(r)}
            >
                Edit
            </Button>

            <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(r.id)}
            >
                Delete
            </Button>
        </div>,
    ]);

    return (
        <Table
            headers={headers}
            data={rows}
        />
    );
}
