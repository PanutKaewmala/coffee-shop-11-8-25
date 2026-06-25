// app/admin/ingredients/archived/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import { Button } from "@/components/ui/button";
import SearchBox from "@/components/admin/search/SearchBox";
import Pagination from "@/components/admin/Pagination";
import type { IngredientRow } from "@/lib/types";
import { BASE_UNIT_LABEL } from "@/lib/units";

type BaseUnit = "ml" | "g" | "piece";
type UnitFilter = "all" | BaseUnit;

function normalizeBaseUnitFromLegacyUnit(u: unknown): BaseUnit {
    const s = typeof u === "string" ? u.trim().toLowerCase() : "";
    if (["ml", "มล.", "มล", "milliliter"].includes(s)) return "ml";
    if (["g", "กรัม", "กร", "gram"].includes(s)) return "g";
    return "piece";
}

function getRowBaseUnit(row: IngredientRow): BaseUnit {
    const r = row as unknown as { base_unit?: unknown; unit?: unknown };
    const base = r.base_unit;
    if (base === "ml" || base === "g" || base === "piece") return base;
    return normalizeBaseUnitFromLegacyUnit(r.unit);
}

function toArray(data: unknown): IngredientRow[] {
    if (Array.isArray(data)) return data as IngredientRow[];

    if (typeof data === "object" && data !== null) {
        const d = data as Record<string, unknown>;
        if (Array.isArray(d.ingredients)) return d.ingredients as IngredientRow[];
        if (Array.isArray(d.items)) return d.items as IngredientRow[];
    }

    return [];
}

export default function ArchivedIngredientsPage() {
    const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("");
    const rowsPerPage = 20;

    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [canManageIngredients, setCanManageIngredients] = useState(false);
    const [permissionLoading, setPermissionLoading] = useState(true);

    useEffect(() => {
        let alive = true;

        async function loadPermission() {
            try {
                const res = await fetch("/api/receipt-settings", { cache: "no-store" });
                const data: unknown = await res.json().catch(() => null);

                if (!alive) return;
                if (!res.ok || !data || typeof data !== "object" || !("canEditShopSettings" in data)) {
                    setCanManageIngredients(false);
                    return;
                }

                setCanManageIngredients((data as Record<string, unknown>).canEditShopSettings === true);
            } catch {
                if (!alive) return;
                setCanManageIngredients(false);
            } finally {
                if (alive) setPermissionLoading(false);
            }
        }

        void loadPermission();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => setInputPage(String(page)), [page]);

    async function fetchArchived() {
        try {
            setLoading(true);
            const res = await fetch("/api/ingredients?archived=1");
            const data: unknown = await res.json();
            setIngredients(toArray(data));
        } catch (e) {
            console.error("fetchArchived error:", e);
            setIngredients([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchArchived();
    }, []);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();

        return ingredients.filter((item) => {
            const name = (item.name ?? "").toLowerCase();
            const base = getRowBaseUnit(item);

            const matchSearch = q === "" ? true : name.includes(q);
            const matchUnit = unitFilter === "all" ? true : base === unitFilter;

            return matchSearch && matchUnit;
        });
    }, [ingredients, search, unitFilter]);

    const totalPages = Math.ceil(filteredItems.length / rowsPerPage) || 1;

    const paginatedItems = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredItems.slice(start, start + rowsPerPage);
    }, [filteredItems, page]);

    useEffect(() => setPage(1), [search, unitFilter]);

    async function restoreIngredient(id: string) {
        if (!canManageIngredients || permissionLoading) return;
        if (restoringId) return;
        if (!confirm("Restore this ingredient?")) return;

        try {
            setRestoringId(id);

            const res = await fetch("/api/ingredients", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    is_active: true,
                    archived_at: null,
                }),
            });

            const j = await res.json().catch(() => ({} as { error?: string }));
            if (!res.ok) {
                alert((j as { error?: string })?.error || "Restore failed");
                return;
            }

            await fetchArchived();
        } finally {
            setRestoringId(null);
        }
    }

    const headers = ["Name", "Stock", "Unit", "Archived At", "Actions"];

    const disableActions = loading || !!restoringId || permissionLoading || !canManageIngredients;

    return (
        <div className="p-6 space-y-6">
            <Card title="Archived Ingredients">
                {!permissionLoading && !canManageIngredients ? (
                    <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                        Read-only mode: only owners can restore archived ingredients.
                    </div>
                ) : null}
                <div className="flex justify-between items-center mb-4 gap-2">
                    <Button
                        variant="outline"
                        onClick={() => (window.location.href = "/admin/ingredients")}
                    >
                        ← Back
                    </Button>
                </div>

                <div className="mb-4 space-y-3">
                    <SearchBox
                        value={search}
                        setValue={setSearch}
                        placeholder="ค้นหา archived..."
                    />

                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-2">
                        <button
                            onClick={() => setUnitFilter("all")}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${unitFilter === "all"
                                    ? "bg-[var(--accent)] text-black"
                                    : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                }`}
                        >
                            ทั้งหมด
                        </button>

                        {(["ml", "g", "piece"] as const).map((u) => (
                            <button
                                key={u}
                                onClick={() => setUnitFilter(u)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${unitFilter === u
                                        ? "bg-[var(--accent)] text-black"
                                        : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                    }`}
                            >
                                {BASE_UNIT_LABEL[u]}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <Table
                        headers={headers}
                        data={paginatedItems.map((item) => {
                            const base = getRowBaseUnit(item);
                            const archivedAt =
                                (item as unknown as { archived_at?: string | null }).archived_at ??
                                "-";

                            const isRestoringThis = restoringId === item.id;

                            return [
                                item.name ?? "-",
                                item.stock,
                                BASE_UNIT_LABEL[base],
                                archivedAt,
                                <div key={item.id} className="flex gap-2">
                                    {canManageIngredients && !permissionLoading ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => restoreIngredient(item.id)}
                                            disabled={disableActions}
                                        >
                                            {isRestoringThis ? "Restoring..." : "Restore"}
                                        </Button>
                                    ) : (
                                        <span className="text-xs text-text-secondary">View only</span>
                                    )}
                                </div>,
                            ];
                        })}
                    />
                )}

                <Pagination
                    page={page}
                    setPage={setPage}
                    totalPages={totalPages}
                    inputPage={inputPage}
                    setInputPage={setInputPage}
                />
            </Card>
        </div>
    );
}
