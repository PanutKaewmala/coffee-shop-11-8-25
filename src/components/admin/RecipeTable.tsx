import { Button } from "@/components/ui/button";
import Table from "@/components/admin/table/Table";
import type { Recipe, Ingredient, MenuItem } from "@/lib/types";

/**
 * รองรับ 2 โหมด:
 * 1) Legacy: Recipe (menu_id + ingredient_id + quantity)
 * 2) New: RecipeItemView (variant_id based) — โครงเดียวกับที่ API ส่งกลับ
 */
type UUID = string;

type RecipeItemView = {
    id: UUID;
    variant_id: UUID;

    menu_id: UUID | null;
    menu_name: string | null;
    serve_type_id: UUID | null;
    serve_type_name: string | null;
    size: string | null;

    ingredient_id: UUID;
    ingredient_name: string | null;
    unit: string | null;

    quantity: number;
    created_at: string;
};

function isRecipeItemView(x: unknown): x is RecipeItemView {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.variant_id === "string" && "ingredient_id" in o && "quantity" in o;
}

interface Props {
    // ✅ รับได้ทั้ง legacy และ new
    recipes: Array<Recipe | RecipeItemView>;

    // legacy maps (ยังใช้ได้ถ้าหน้า parent ยังส่งมา)
    menuItems?: MenuItem[];
    ingredients?: Ingredient[];

    // ถ้าเลือก variant แล้ว -> ส่ง id มาเพื่อซ่อนคอลัมน์ variant
    selectedVariantId?: string | null;

    // callbacks
    onEdit: (recipe: Recipe | RecipeItemView) => void;
    onDelete: (id: string) => void;
}

export default function RecipeTable({
    recipes,
    menuItems = [],
    ingredients = [],
    selectedVariantId = null,
    onEdit,
    onDelete,
}: Props) {
    const menuMap = Object.fromEntries(menuItems.map((m) => [m.id, m.name]));
    const ingredientMap = Object.fromEntries(
        ingredients.map((i) => [i.id, `${i.name}${i.unit ? ` (${i.unit})` : ""}`])
    );

    const first = recipes[0];
    const isNew = isRecipeItemView(first);

    // --- Headers
    const baseHeadersNew = ["ตัวเลือก", "วัตถุดิบ", "ปริมาณ", "จัดการ"];
    const baseHeadersLegacy = ["เมนู", "วัตถุดิบ", "ปริมาณ", "จัดการ"];

    const headers = (() => {
        if (!isNew) return baseHeadersLegacy;

        // ✅ ถ้าเลือก variant แล้ว ซ่อนคอลัมน์ Variant (ลดรก)
        if (selectedVariantId) {
            return ["วัตถุดิบ", "ปริมาณ", "จัดการ"];
        }
        return baseHeadersNew;
    })();

    // --- Rows
    const rows = recipes.map((r) => {
        if (isRecipeItemView(r)) {
            const variantLabel =
                r.serve_type_name
                    ? `${r.serve_type_name}${r.size ? ` • ${r.size}` : ""}`
                    : r.size ?? "—";

            const ingredientLabel =
                r.ingredient_name
                    ? `${r.ingredient_name}${r.unit ? ` (${r.unit})` : ""}`
                    : ingredientMap[r.ingredient_id] ?? "—";

            const actionCell = (
                <div key={r.id} className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                        แก้ไข
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => onDelete(r.id)}>
                        ลบ
                    </Button>
                </div>
            );

            // ซ่อน variant column ถ้าเลือกแล้ว
            if (selectedVariantId) {
                return [ingredientLabel, r.quantity, actionCell];
            }

            return [variantLabel, ingredientLabel, r.quantity, actionCell];
        }

        // ---- legacy Recipe
        const menuLabel = menuMap[r.menu_id] ?? "—";
        const ingredientLabel = ingredientMap[r.ingredient_id] ?? "—";

        return [
            menuLabel,
            ingredientLabel,
            r.quantity,
            <div key={r.id} className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                    แก้ไข
                </Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(r.id)}>
                    ลบ
                </Button>
            </div>,
        ];
    });

    return <Table headers={headers} data={rows} />;
}
