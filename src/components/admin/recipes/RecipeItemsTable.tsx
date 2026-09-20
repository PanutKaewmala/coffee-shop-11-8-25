"use client";

import Table from "@/components/admin/table/Table";
import { Button } from "@/components/ui/button";
import type { RecipeItemView } from "@/lib/recipeTypes";
export type { RecipeItemView } from "@/lib/recipeTypes";

export default function RecipeItemsTable({
    rows,
    onEdit,
    onDelete,
    readOnly = false,
}: {
    rows: RecipeItemView[];
    onEdit: (row: RecipeItemView) => void;
    onDelete: (id: string) => void;
    readOnly?: boolean;
}) {
    const data = rows.map((r) => {
        const nameCell = (
            <div key={`n-${r.id}`} className="flex flex-col">
                <span className="font-medium">{r.ingredient_name ?? r.source_id}</span>
                <span className="text-xs text-[var(--text-secondary)]">{r.unit ?? "-"}</span>
                {r.source_type === "supply_item" ? <span className="text-xs text-[var(--text-secondary)]">TALVO Supply</span> : null}
                {r.branch_id === null ? <span className="text-xs text-amber-600">ยังไม่กำหนดสาขา — แก้ไขหรือลบรายการนี้ก่อนขาย</span> : null}
            </div>
        );

        const qtyCell = (
            <span key={`q-${r.id}`}>
                {r.quantity} {r.unit ?? ""}
            </span>
        );

        const actionsCell = (
            <div key={`a-${r.id}`} className="flex gap-2">
                {readOnly ? (
                    <span className="text-xs text-[var(--text-secondary)]">ดูอย่างเดียว</span>
                ) : (
                    <>
                        <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                            แก้ไข
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => onDelete(r.id)}>
                            ลบ
                        </Button>
                    </>
                )}
            </div>
        );

        return [nameCell, qtyCell, actionsCell];
    });

    return <Table headers={["วัตถุดิบ", "จำนวน", "จัดการ"]} data={data} />;
}
