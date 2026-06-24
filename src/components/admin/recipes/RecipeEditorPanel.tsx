"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/search/SearchBox";
import type { Ingredient } from "@/lib/types";

import VariantSelector from "./VariantSelector";
import RecipeItemsTable, { type RecipeItemView } from "./RecipeItemsTable";
import AddIngredientModal from "./AddIngredientModal";
import type { VariantOption } from "./RecipesShell";

const RECENT_KEY = "coffee_saas_recent_ingredients_v1";

/* =========================
   utils (no any)
========================= */
function safeParseStringArray(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw) as unknown;
        if (!Array.isArray(v)) return [];
        return v.filter((x) => typeof x === "string" && x.trim()).slice(0, 10);
    } catch {
        return [];
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function extractRecipeItems(raw: unknown): RecipeItemView[] {
    if (!isRecord(raw)) return [];
    const items = raw.items;
    if (!Array.isArray(items)) return [];

    return items.filter((x): x is RecipeItemView => {
        if (!isRecord(x)) return false;
        return (
            typeof x.id === "string" &&
            typeof x.variant_id === "string" &&
            typeof x.ingredient_id === "string" &&
            typeof x.quantity === "number" &&
            typeof x.created_at === "string"
        );
    });
}

type Draft = {
    id?: string;
    variant_id: string;
    ingredient_id: string;
    quantity: number;
    ingredient_name?: string | null;
    ingredient_unit?: string | null;
};

export default function RecipeEditorPanel({
    loadingBase,
    ingredients,
    selectedMenuId,
    variantsForMenu,
    selectedVariantId,
    setSelectedVariantId,
    onRefreshBase,
    canManageRecipes,
    permissionLoading,
}: {
    loadingBase: boolean;
    ingredients: Ingredient[];
    selectedMenuId: string;
    variantsForMenu: VariantOption[];
    selectedVariantId: string;
    setSelectedVariantId: (id: string) => void;
    onRefreshBase: () => Promise<void>;
    canManageRecipes: boolean;
    permissionLoading: boolean;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [items, setItems] = useState<RecipeItemView[]>([]);
    const [search, setSearch] = useState("");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");
    const rowsPerPage = 20;

    /* =========================
       recent ingredients
    ========================= */
    const [recentIngredientIds, setRecentIngredientIds] = useState<string[]>([]);

    useEffect(() => {
        setRecentIngredientIds(safeParseStringArray(localStorage.getItem(RECENT_KEY)));
    }, []);

    useEffect(() => {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentIngredientIds.slice(0, 10)));
    }, [recentIngredientIds]);

    const pushRecent = useCallback((id: string) => {
        setRecentIngredientIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 10));
    }, []);

    useEffect(() => setInputPage(String(page)), [page]);

    const canEdit = Boolean(selectedMenuId) && variantsForMenu.length > 0 && Boolean(selectedVariantId);

    /* =========================
       fetch items
    ========================= */
    const fetchItems = useCallback(async () => {
        try {
            if (!canEdit) {
                setItems([]);
                return;
            }
            setLoading(true);

            const url = `/api/recipes/items?variant_id=${encodeURIComponent(selectedVariantId)}`;
            const raw: unknown = await fetch(url, { cache: "no-store" }).then((r) => r.json());

            setItems(extractRecipeItems(raw));

            setPage(1);
            setInputPage("1");
        } catch (e) {
            console.error("fetchItems:", e);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [canEdit, selectedVariantId]);

    useEffect(() => {
        void fetchItems();
    }, [fetchItems]);

    /* =========================
       search + pagination
    ========================= */
    const filtered = useMemo(() => {
        if (!canEdit) return [];
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((x) => (x.ingredient_name ?? "").toLowerCase().includes(q));
    }, [items, search, canEdit]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));

    const paginated = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filtered.slice(start, start + rowsPerPage);
    }, [filtered, page]);

    /* =========================
       used ingredient set
    ========================= */
    const usedIngredientSet = useMemo(() => new Set(items.map((x) => x.ingredient_id)), [items]);

    /* =========================
       modal state
    ========================= */
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"add" | "edit">("add");
    const [draft, setDraft] = useState<Draft>({
        variant_id: selectedVariantId,
        ingredient_id: "",
        quantity: 1,
        ingredient_name: null,
        ingredient_unit: null,
    });

    useEffect(() => {
        // keep draft variant in sync when switching variants
        setDraft((d) => ({ ...d, variant_id: selectedVariantId || d.variant_id }));
    }, [selectedVariantId]);

    const openAdd = () => {
        if (!canEdit) {
            alert("เลือกเมนู + Variant ก่อน");
            return;
        }
        setMode("add");
        setDraft({
            variant_id: selectedVariantId,
            ingredient_id: "",
            quantity: 1,
            ingredient_name: null,
            ingredient_unit: null,
        });
        setOpen(true);
    };

    const openEdit = (row: RecipeItemView) => {
        setMode("edit");
        setDraft({
            id: row.id,
            variant_id: row.variant_id,
            ingredient_id: row.ingredient_id,
            quantity: row.quantity ?? 1,
            ingredient_name: row.ingredient_name,
            ingredient_unit: row.unit,
        });
        setOpen(true);
    };

    const close = () => setOpen(false);

    /* =========================
       save / delete
    ========================= */
    const save = async (payload: { id?: string; variant_id: string; ingredient_id: string; quantity: number }) => {
        try {
            const isEdit = Boolean(payload.id);

            const res = await fetch("/api/recipes/items", {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isEdit
                        ? { id: payload.id, quantity: payload.quantity }
                        : { variant_id: payload.variant_id, ingredient_id: payload.ingredient_id, quantity: payload.quantity }
                ),
            });

            if (!res.ok) {
                const raw = await res.text().catch(() => "");
                console.error("save failed:", res.status, raw);
                alert("บันทึกสูตรไม่สำเร็จ");
                return;
            }

            if (!isEdit) pushRecent(payload.ingredient_id);

            close();
            void fetchItems();
            void onRefreshBase();
        } catch (e) {
            console.error(e);
            alert("บันทึกสูตรไม่สำเร็จ");
        }
    };

    const del = async (id: string) => {
        if (!confirm("Delete this ingredient from recipe?")) return;

        const res = await fetch(`/api/recipes/items?id=${encodeURIComponent(id)}`, { method: "DELETE" });

        if (!res.ok) {
            const raw = await res.text().catch(() => "");
            console.error("delete failed:", res.status, raw);
            alert("ลบไม่สำเร็จ");
            return;
        }

        void fetchItems();
        void onRefreshBase();
    };

    /* =========================
       UI states
    ========================= */
    if (loadingBase) {
        return (
            <div className="rounded-2xl border border-[var(--text-muted)]/15 bg-[var(--surface)] p-5">
                Loading...
            </div>
        );
    }

    if (!selectedMenuId) {
        return (
            <div className="rounded-2xl border border-[var(--text-muted)]/15 bg-[var(--surface)] p-6 text-center text-[var(--text-secondary)]">
                เลือกเมนูทางซ้ายเพื่อเริ่มตั้งสูตร
            </div>
        );
    }

    if (variantsForMenu.length === 0) {
        return (
            <div className="rounded-2xl border border-[var(--text-muted)]/15 bg-[var(--surface)] p-6 text-center text-[var(--text-secondary)]">
                เมนูนี้ยังไม่มี Variant — ไปสร้าง Variant ก่อน แล้วกลับมาที่นี่
                <div className="mt-2 text-sm text-[var(--text-secondary)]">Note: Menus require at least one Variant with a recipe to appear in POS.</div>
                <div className="mt-4 flex items-center justify-center gap-2">
                    <Button onClick={() => router.push("/admin/menu")}>
                        ไปสร้าง Variant
                    </Button>
                    <Button variant="outline" onClick={() => void onRefreshBase()}>
                        Refresh
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-[var(--text-muted)]/15 bg-[var(--surface)] p-5 space-y-4">
            {/* header */}
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                    <div className="font-semibold">Recipe Editor</div>

                    <VariantSelector
                        variants={variantsForMenu}
                        value={selectedVariantId}
                        onChange={(v: string) => {
                            setSelectedVariantId(v);
                            setPage(1);
                            setInputPage("1");
                        }}
                    />
                </div>

                <div className="pt-7">
                    <Button onClick={openAdd} disabled={!canEdit || !canManageRecipes || permissionLoading}>
                        + Add Ingredient
                    </Button>
                </div>
            </div>

            {/* search */}
            <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาวัตถุดิบในสูตร..." />

            {/* body */}
            {loading ? (
                <div className="text-sm text-[var(--text-secondary)]">Loading recipe...</div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-[var(--text-muted)]/20 p-6 text-center text-[var(--text-secondary)]">
                    <div className="font-semibold">This variant has no recipe</div>
                    <div className="mt-2 text-sm text-[var(--text-secondary)]">This variant will not appear in POS until ingredients are added.</div>
                    <div className="mt-3">Press <span className="text-[var(--accent)] font-semibold">Add Ingredient</span> to create a recipe.</div>
                </div>
            ) : (
                <>
                    <RecipeItemsTable
                        rows={paginated}
                        onEdit={openEdit}
                        onDelete={(id: string) => void del(id)}
                        readOnly={!canManageRecipes || permissionLoading}
                    />
                    <Pagination
                        page={page}
                        setPage={setPage}
                        totalPages={totalPages}
                        inputPage={inputPage}
                        setInputPage={setInputPage}
                    />
                </>
            )}

            <AddIngredientModal
                key={`${mode}-${draft.id ?? "new"}-${draft.variant_id}-${draft.ingredient_id}-${open ? "open" : "closed"}`}
                open={open}
                onClose={close}
                mode={mode}
                draft={draft}
                setDraft={setDraft}
                variantsForMenu={variantsForMenu}
                ingredients={ingredients}
                disabledIds={
                    mode === "add"
                        ? usedIngredientSet
                        : new Set([...usedIngredientSet].filter((x) => x !== draft.ingredient_id))
                }
                recentIds={recentIngredientIds}
                onPickRecent={pushRecent}
                onSave={(p) => void save(p)}
                lockIngredient={mode === "edit"}
            />
        </div>
    );
}
