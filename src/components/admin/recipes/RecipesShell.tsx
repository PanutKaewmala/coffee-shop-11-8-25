"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/admin/Card";
import type { Ingredient } from "@/lib/types";
import MenuPickerPanel from "./MenuPickerPanel";
import RecipeEditorPanel from "./RecipeEditorPanel";

type UUID = string;

type MenuView = {
    id: UUID;
    name: string;
    price: number;
    category: string | null;
    serve_types: string[];
    image_url: string | null;
    description: string | null;
    created_at: string;
};

type VariantView = {
    id: UUID;
    menu_id: UUID;
    serve_type_id: UUID | null;
    serve_type_name: string | null;
    size: string | null;
    price_override: number | null;
    image_url: string | null;
    is_default: boolean;
    created_at: string;
};

type RecipeItemLite = {
    variant_id: UUID;
    menu_id: UUID | null;
};

type MenuRecipeCoverage = {
    variantCount: number;
    readyVariantCount: number;
    missingVariantLabels: string[];
};

type RecipeCoverageStatus = "empty_variant" | "no_recipe" | "partial_recipe" | "full_recipe";
type MenuRecipeStatus = "no_recipe" | "partial_recipe" | "full_recipe";

export type VariantOption = {
    variant_id: UUID;
    menu_id: UUID;
    label: string;
    displayLabel: string;
    is_default: boolean;
    isReadyForPos: boolean;
};

type MenuCardView = {
    id: UUID;
    name: string;
    category: string | null;
    created_at: string;
    variantCount: number;
    recipeItemCount: number;
    readyVariantCount: number;
    missingVariantCount: number;
    missingVariantLabels: string[];
    coverageStatus: RecipeCoverageStatus;
    recipeStatus: MenuRecipeStatus;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asString(v: unknown, fb = ""): string {
    return typeof v === "string" ? v : fb;
}

function toNumber(v: unknown, fb = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fb;
}

function extractArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeServeNames(v: unknown): string[] {
    if (!Array.isArray(v) || v.length === 0) return [];
    if (typeof v[0] === "string") return (v as string[]).filter(Boolean);
    if (typeof v[0] === "object" && v[0] !== null) {
        return (v as Array<Record<string, unknown>>)
            .map((x) => (typeof x.name === "string" ? x.name : ""))
            .filter(Boolean);
    }
    return [];
}

function normalizeSizeLabel(sizeRaw: unknown): string {
    const s = typeof sizeRaw === "string" ? sizeRaw.trim() : "";
    if (!s) return "";
    if (s.toLowerCase() === "default") return "";
    return ` • ${s}`;
}

function displayVariantLabel(full: string): string {
    const parts = full.split("•").map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) return full;
    return parts.slice(1).join(" • ");
}

const SERVE_PRIORITY = ["iced", "hot", "blend", "frappe"];

function extractServeFromLabel(label: string): string {
    const parts = label.split(/•|โ€ข/g).map((s) => s.trim()).filter(Boolean);
    return parts[1] ?? "";
}

function serveRank(label: string): number {
    const serve = extractServeFromLabel(label).toLowerCase();
    const idx = SERVE_PRIORITY.findIndex((p) => p === serve);
    return idx === -1 ? 999 : idx;
}

function sortVariantsSmart(a: VariantOption, b: VariantOption): number {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    const ra = serveRank(a.label);
    const rb = serveRank(b.label);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
}

function extractIngredients(raw: unknown): Ingredient[] {
    if (Array.isArray(raw)) return raw as Ingredient[];
    if (isRecord(raw)) {
        if (Array.isArray(raw.ingredients)) return raw.ingredients as Ingredient[];
        if (Array.isArray(raw.items)) return raw.items as Ingredient[];
    }
    return [];
}

function extractMenus(raw: unknown): MenuView[] {
    const list = Array.isArray(raw) ? raw : (isRecord(raw) && Array.isArray(raw.menu) ? raw.menu : []);
    return extractArray<unknown>(list)
        .map((it): MenuView | null => {
            if (!isRecord(it)) return null;
            const id = asString(it.id);
            const name = asString(it.name);
            if (!id || !name) return null;
            return {
                id,
                name,
                price: toNumber(it.price, 0),
                category: asString(it.category, "") || null,
                serve_types: normalizeServeNames(it.serve_types),
                image_url: asString(it.image_url, "") || null,
                description: asString(it.description, "") || null,
                created_at: asString(it.created_at, "1970-01-01T00:00:00Z"),
            };
        })
        .filter((x): x is MenuView => Boolean(x));
}

function extractVariants(raw: unknown): VariantView[] {
    const list = Array.isArray(raw) ? raw : (isRecord(raw) && Array.isArray(raw.variants) ? raw.variants : []);
    return extractArray<unknown>(list)
        .map((it): VariantView | null => {
            if (!isRecord(it)) return null;
            const id = asString(it.id);
            const menu_id = asString(it.menu_id);
            if (!id || !menu_id) return null;
            return {
                id,
                menu_id,
                serve_type_id: asString(it.serve_type_id, "") || null,
                serve_type_name: asString(it.serve_type_name, "") || null,
                size: asString(it.size, "") || null,
                price_override:
                    typeof it.price_override === "number"
                        ? it.price_override
                        : it.price_override == null
                            ? null
                            : toNumber(it.price_override, 0),
                image_url: asString(it.image_url, "") || null,
                is_default: Boolean(it.is_default),
                created_at: asString(it.created_at, "1970-01-01T00:00:00Z"),
            };
        })
        .filter((x): x is VariantView => Boolean(x));
}

function extractRecipeItems(raw: unknown): RecipeItemLite[] {
    const list = Array.isArray(raw) ? raw : (isRecord(raw) && Array.isArray(raw.items) ? raw.items : []);
    return extractArray<unknown>(list)
        .map((it): RecipeItemLite | null => {
            if (!isRecord(it)) return null;
            const variant_id = asString(it.variant_id);
            if (!variant_id) return null;
            return {
                variant_id,
                menu_id: asString(it.menu_id, "") || null,
            };
        })
        .filter((x): x is RecipeItemLite => Boolean(x));
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    const current = map.get(key);
    if (current) {
        current.add(value);
        return;
    }
    map.set(key, new Set([value]));
}

function getCoverageStatus(variantCount: number, recipeVariantCount: number): RecipeCoverageStatus {
    if (variantCount === 0) return "empty_variant";
    if (recipeVariantCount === 0) return "no_recipe";
    if (recipeVariantCount < variantCount) return "partial_recipe";
    return "full_recipe";
}

function getRecipeStatus(variantCount: number, readyVariantCount: number): MenuRecipeStatus {
    if (variantCount === 0 || readyVariantCount === 0) return "no_recipe";
    if (readyVariantCount < variantCount) return "partial_recipe";
    return "full_recipe";
}

export default function RecipesShell() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [canManageRecipes, setCanManageRecipes] = useState(false);
    const [permissionLoading, setPermissionLoading] = useState(true);

    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [menuItems, setMenuItems] = useState<MenuView[]>([]);
    const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
    const [recipeItems, setRecipeItems] = useState<RecipeItemLite[]>([]);

    const [selectedMenuId, setSelectedMenuId] = useState<string>("");
    const [selectedVariantId, setSelectedVariantId] = useState<string>("");

    const [searchMenu, setSearchMenu] = useState("");
    const [leftFilter, setLeftFilter] = useState<"all" | "empty" | "no_recipe" | "partial_recipe" | "has_recipe">(
        "all"
    );

    const fetchJsonStrict = useCallback(async (url: string): Promise<unknown> => {
        const res = await fetch(url, { cache: "no-store" });
        const raw: unknown = await res.json().catch(() => null);
        if (!res.ok) {
            const msg =
                isRecord(raw) && typeof raw.error === "string"
                    ? raw.error
                    : `Request failed (${res.status})`;
            throw new Error(`${url}: ${msg}`);
        }
        return raw;
    }, []);

    const fetchBase = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);

            const [ingRaw, menuRaw, variantsRaw, recipeRaw] = await Promise.all([
                fetchJsonStrict("/api/ingredients"),
                fetchJsonStrict("/api/menu"),
                fetchJsonStrict("/api/menu/variants"),
                fetchJsonStrict("/api/recipes/items"),
            ]);

            const ingList = extractIngredients(ingRaw);
            const menus = extractMenus(menuRaw);
            const vList = extractVariants(variantsRaw);
            const rList = extractRecipeItems(recipeRaw);

            setIngredients(ingList);
            setMenuItems(menus);
            setRecipeItems(rList);

            const readyVariantIds = new Set(rList.map((r) => r.variant_id));
            const menuNameMap = new Map<UUID, string>(menus.map((m) => [m.id, m.name]));
            const opts: VariantOption[] = vList.map((v) => {
                const menuName = menuNameMap.get(v.menu_id) ?? v.menu_id;
                const serveName = v.serve_type_name ?? "รูปแบบการขาย";
                const sizeLabel = normalizeSizeLabel(v.size);
                return {
                    variant_id: v.id,
                    menu_id: v.menu_id,
                    label: `${menuName} • ${serveName}${sizeLabel}`,
                    is_default: Boolean(v.is_default),
                };
            }).map((v) => ({
                ...v,
                displayLabel: displayVariantLabel(v.label),
                isReadyForPos: readyVariantIds.has(v.variant_id),
            }));

            opts.sort(sortVariantsSmart);
            setVariantOptions(opts);
        } catch (e) {
            console.error("fetchBase:", e);
            setLoadError("โหลดข้อมูลสูตรไม่สำเร็จ");
            setIngredients([]);
            setMenuItems([]);
            setVariantOptions([]);
            setRecipeItems([]);
        } finally {
            setLoading(false);
        }
    }, [fetchJsonStrict]);

    useEffect(() => {
        void fetchBase();
    }, [fetchBase]);

    useEffect(() => {
        let alive = true;

        async function loadPermission() {
            try {
                const res = await fetch("/api/receipt-settings", { cache: "no-store" });
                const data: unknown = await res.json().catch(() => null);

                if (!alive) return;
                if (!res.ok || !data || !isRecord(data) || !("canEditShopSettings" in data)) {
                    setCanManageRecipes(false);
                    return;
                }

                setCanManageRecipes((data as Record<string, unknown>).canEditShopSettings === true);
            } catch {
                if (!alive) return;
                setCanManageRecipes(false);
            } finally {
                if (alive) setPermissionLoading(false);
            }
        }

        void loadPermission();
        return () => {
            alive = false;
        };
    }, []);

    const menuCards = useMemo(() => {
        const q = searchMenu.trim().toLowerCase();

        const variantsByMenu = new Map<string, VariantOption[]>();
        const variantIdToMenu = new Map<string, string>();
        for (const v of variantOptions) {
            const current = variantsByMenu.get(v.menu_id);
            if (current) current.push(v);
            else variantsByMenu.set(v.menu_id, [v]);
            variantIdToMenu.set(v.variant_id, v.menu_id);
        }

        const recipeVariantIdsByMenu = new Map<string, Set<string>>();
        for (const r of recipeItems) {
            const menuId = variantIdToMenu.get(r.variant_id) ?? r.menu_id ?? "";
            if (!menuId) continue;

            const variantsOfMenu = variantsByMenu.get(menuId);
            if (!variantsOfMenu?.some((v) => v.variant_id === r.variant_id)) continue;

            addToSetMap(recipeVariantIdsByMenu, menuId, r.variant_id);
        }

        const coverageByMenu = new Map<string, MenuRecipeCoverage>();
        for (const m of menuItems) {
            const variants = variantsByMenu.get(m.id) ?? [];
            const readyVariantIds = recipeVariantIdsByMenu.get(m.id) ?? new Set<string>();
            const missingVariantLabels = variants
                .filter((v) => !readyVariantIds.has(v.variant_id))
                .map((v) => v.displayLabel || displayVariantLabel(v.label));

            coverageByMenu.set(m.id, {
                variantCount: variants.length,
                readyVariantCount: readyVariantIds.size,
                missingVariantLabels,
            });
        }

        let list: MenuCardView[] = menuItems
            .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
            .map((m) => {
                const variantCount = coverageByMenu.get(m.id)?.variantCount ?? 0;
                const readyVariantCount = coverageByMenu.get(m.id)?.readyVariantCount ?? 0;
                const missingVariantLabels = coverageByMenu.get(m.id)?.missingVariantLabels ?? [];
                return {
                    id: m.id,
                    name: m.name,
                    category: m.category,
                    created_at: m.created_at,
                    variantCount,
                    recipeItemCount: readyVariantCount,
                    readyVariantCount,
                    missingVariantCount: missingVariantLabels.length,
                    missingVariantLabels,
                    coverageStatus: getCoverageStatus(variantCount, readyVariantCount),
                    recipeStatus: getRecipeStatus(variantCount, readyVariantCount),
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        if (leftFilter === "empty") {
            list = list.filter((m) => m.coverageStatus === "empty_variant");
        } else if (leftFilter === "no_recipe") {
            list = list.filter((m) => m.coverageStatus === "no_recipe");
        } else if (leftFilter === "partial_recipe") {
            list = list.filter((m) => m.coverageStatus === "partial_recipe");
        } else if (leftFilter === "has_recipe") {
            list = list.filter((m) => m.coverageStatus === "full_recipe");
        }

        return list;
    }, [menuItems, variantOptions, recipeItems, searchMenu, leftFilter]);

    useEffect(() => {
        if (menuCards.length === 0) {
            setSelectedMenuId("");
            return;
        }
        const exists = menuCards.some((m) => m.id === selectedMenuId);
        if (!exists) setSelectedMenuId(menuCards[0].id);
    }, [menuCards, selectedMenuId]);

    const variantsForSelectedMenu = useMemo(() => {
        if (!selectedMenuId) return [];
        return variantOptions.filter((v) => v.menu_id === selectedMenuId).slice().sort(sortVariantsSmart);
    }, [variantOptions, selectedMenuId]);

    useEffect(() => {
        if (!selectedMenuId) {
            setSelectedVariantId("");
            return;
        }
        if (variantsForSelectedMenu.length === 0) {
            setSelectedVariantId("");
            return;
        }
        const stillValid = variantsForSelectedMenu.some((v) => v.variant_id === selectedVariantId);
        if (!stillValid) setSelectedVariantId(variantsForSelectedMenu[0].variant_id);
    }, [selectedMenuId, variantsForSelectedMenu, selectedVariantId]);

    return (
        <div className="p-6">
            <Card title="สูตรเมนู">
                {loadError ? (
                    <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                        {loadError}
                    </div>
                ) : null}
                {!permissionLoading && !canManageRecipes ? (
                    <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        โหมดอ่านอย่างเดียว: เฉพาะเจ้าของร้านเท่านั้นที่แก้ไขสูตรได้
                    </div>
                ) : null}
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 lg:col-span-4">
                        <MenuPickerPanel
                            loading={loading}
                            items={menuCards}
                            selectedMenuId={selectedMenuId}
                            onSelectMenu={setSelectedMenuId}
                            search={searchMenu}
                            setSearch={setSearchMenu}
                            filter={leftFilter}
                            setFilter={setLeftFilter}
                        />
                    </div>

                    <div className="col-span-12 lg:col-span-8">
                        <RecipeEditorPanel
                            loadingBase={loading}
                            ingredients={ingredients}
                            selectedMenuId={selectedMenuId}
                            variantsForMenu={variantsForSelectedMenu}
                            selectedVariantId={selectedVariantId}
                            setSelectedVariantId={setSelectedVariantId}
                            onRefreshBase={fetchBase}
                            canManageRecipes={canManageRecipes}
                            permissionLoading={permissionLoading}
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
