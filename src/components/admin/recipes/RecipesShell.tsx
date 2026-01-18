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

export type VariantOption = {
    variant_id: UUID;
    menu_id: UUID;
    label: string;
    is_default: boolean;
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

/* ===== smart variant ordering ===== */
const SERVE_PRIORITY = ["เย็น", "ร้อน", "ปั่น", "hot", "iced", "blend", "frappe"];
function extractServeFromLabel(label: string): string {
    const parts = label.split("•").map((s) => s.trim()).filter(Boolean);
    return parts[1] ?? "";
}
function serveRank(label: string): number {
    const serve = extractServeFromLabel(label).toLowerCase();
    const idx = SERVE_PRIORITY.findIndex((p) => p.toLowerCase() === serve);
    return idx === -1 ? 999 : idx;
}
function sortVariantsSmart(a: VariantOption, b: VariantOption): number {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    const ra = serveRank(a.label);
    const rb = serveRank(b.label);
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
}

/* ===== API extractors ===== */
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

export default function RecipesShell() {
    const [loading, setLoading] = useState(true);

    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [menuItems, setMenuItems] = useState<MenuView[]>([]);
    const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);

    const [selectedMenuId, setSelectedMenuId] = useState<string>("");
    const [selectedVariantId, setSelectedVariantId] = useState<string>("");

    const [searchMenu, setSearchMenu] = useState("");
    const [leftFilter, setLeftFilter] = useState<"all" | "empty">("all"); // MVP: all/empty (ยังไม่ทำ coverage จริง)

    const fetchBase = useCallback(async () => {
        try {
            setLoading(true);

            const [ingRaw, menuRaw, variantsRaw] = await Promise.all([
                fetch("/api/ingredients", { cache: "no-store" }).then((r) => r.json() as Promise<unknown>),
                fetch("/api/menu", { cache: "no-store" }).then((r) => r.json() as Promise<unknown>),
                fetch("/api/menu/variants", { cache: "no-store" }).then((r) => r.json() as Promise<unknown>),
            ]);

            const ingList = extractIngredients(ingRaw);
            const menus = extractMenus(menuRaw);
            const vList = extractVariants(variantsRaw);

            setIngredients(ingList);
            setMenuItems(menus);

            const menuNameMap = new Map<UUID, string>(menus.map((m) => [m.id, m.name]));
            const opts: VariantOption[] = vList.map((v) => {
                const menuName = menuNameMap.get(v.menu_id) ?? v.menu_id;
                const serveName = v.serve_type_name ?? "Serve";
                const sizeLabel = normalizeSizeLabel(v.size);
                return {
                    variant_id: v.id,
                    menu_id: v.menu_id,
                    label: `${menuName} • ${serveName}${sizeLabel}`,
                    is_default: Boolean(v.is_default),
                };
            });

            opts.sort(sortVariantsSmart);
            setVariantOptions(opts);

            if (!selectedMenuId && menus[0]?.id) setSelectedMenuId(menus[0].id);
        } catch (e) {
            console.error("fetchBase:", e);
            setIngredients([]);
            setMenuItems([]);
            setVariantOptions([]);
        } finally {
            setLoading(false);
        }
    }, [selectedMenuId]);

    useEffect(() => {
        void fetchBase();
    }, [fetchBase]);

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

    const menuCards = useMemo(() => {
        const q = searchMenu.trim().toLowerCase();

        const variantCountByMenu = new Map<string, number>();
        for (const v of variantOptions) {
            variantCountByMenu.set(v.menu_id, (variantCountByMenu.get(v.menu_id) ?? 0) + 1);
        }

        let list = menuItems
            .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
            .map((m) => ({
                id: m.id,
                name: m.name,
                category: m.category,
                created_at: m.created_at,
                variantCount: variantCountByMenu.get(m.id) ?? 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (leftFilter === "empty") {
            list = list.filter((m) => m.variantCount === 0);
        }
        return list;
    }, [menuItems, variantOptions, searchMenu, leftFilter]);

    return (
        <div className="p-6">
            <Card title="Recipes">
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
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
