"use client";

import Table from "@/components/admin/table/Table";
import { Button } from "@/components/ui/button";

type UUID = string;

export type RecipeItemView = {
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

export default function RecipeItemsTable({
    rows,
    onEdit,
    onDelete,
}: {
    rows: RecipeItemView[];
    onEdit: (row: RecipeItemView) => void;
    onDelete: (id: string) => void;
}) {
    const data = rows.map((r) => {
        const nameCell = (
            <div key={`n-${r.id}`} className="flex flex-col">
                <span className="font-medium">{r.ingredient_name ?? r.ingredient_id}</span>
                <span className="text-xs text-[var(--text-secondary)]">{r.unit ?? "-"}</span>
            </div>
        );

        const qtyCell = (
            <span key={`q-${r.id}`}>
                {r.quantity} {r.unit ?? ""}
            </span>
        );

        const actionsCell = (
            <div key={`a-${r.id}`} className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                    Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(r.id)}>
                    Delete
                </Button>
            </div>
        );

        return [nameCell, qtyCell, actionsCell];
    });

    return <Table headers={["Ingredient", "Qty", "Actions"]} data={data} />;
}
