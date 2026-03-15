// hooks/useMenuSearch.ts
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { MenuItem } from "@/lib/types";

interface UseMenuSearchOptions {
    rowsPerPage?: number;
    includeDisabled?: boolean;
}

/* =========================
   Helpers (NO any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asString(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** category อาจเป็น string หรือ object (เช่น {id,name}) -> แปลงเป็น string */
function normalizeCategory(input: unknown): string {
    if (typeof input === "string") return input;
    if (isRecord(input)) {
        const name = input.name;
        if (typeof name === "string") return name;
    }
    return "";
}

/** /api/menu อาจคืน: MenuItem[] หรือ { menu: MenuItem[] } */
function parseMenuResponse(raw: unknown): MenuItem[] {
    if (Array.isArray(raw)) {
        return raw.filter((x): x is MenuItem => isRecord(x)) as MenuItem[];
    }
    if (isRecord(raw) && Array.isArray(raw.menu)) {
        return raw.menu.filter((x): x is MenuItem => isRecord(x)) as MenuItem[];
    }
    return [];
}

type ServePrice = {
    serve_type: string;
    price: number;
    is_default: boolean;
    has_override: boolean;
};

function normalizeServePrices(input: unknown): ServePrice[] {
    if (!Array.isArray(input)) return [];
    const out: ServePrice[] = [];

    for (const x of input) {
        if (!isRecord(x)) continue;

        const serve_type = asString(x.serve_type).trim();
        const price = asNumber(x.price);
        const is_default = Boolean(x.is_default);
        const has_override = Boolean(x.has_override);

        if (!serve_type) continue;
        if (price === null || price <= 0) continue;

        out.push({ serve_type, price, is_default, has_override });
    }

    // unique by serve_type (prefer default)
    const map = new Map<string, ServePrice>();
    for (const r of out) {
        const existing = map.get(r.serve_type);
        if (!existing) {
            map.set(r.serve_type, r);
        } else if (!existing.is_default && r.is_default) {
            map.set(r.serve_type, r);
        }
    }

    return Array.from(map.values());
}

/** serve_types อาจเป็น string[] หรือ object[] -> แปลงเป็น string[] */
function normalizeServeTypes(input: unknown): string[] {
    if (!Array.isArray(input)) return [];

    const out: string[] = [];
    for (const x of input) {
        if (typeof x === "string") {
            const s = x.trim();
            if (s) out.push(s);
            continue;
        }
        if (isRecord(x)) {
            const name = x.name;
            if (typeof name === "string") {
                const s = name.trim();
                if (s) out.push(s);
            }
        }
    }

    return Array.from(new Set(out));
}

/* =========================
   Normalized type for this hook
========================= */
type NormalizedMenuItem = Omit<MenuItem, "serve_types" | "category"> & {
    serve_types: string[];
    category: string;
    serve_prices: ServePrice[];
};

/* =========================
   Main hook
========================= */
export default function useMenuSearch({
    rowsPerPage = 20,
    includeDisabled = false,
}: UseMenuSearchOptions = {}) {
    const [menuItems, setMenuItems] = useState<NormalizedMenuItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");

    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [serveFilter, setServeFilter] = useState<string>("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");

    const loadMenu = useCallback(async () => {
        setLoading(true);

        try {
            const params = new URLSearchParams();
            if (includeDisabled) params.set("include_disabled", "1");
            const url = params.size > 0 ? `/api/menu?${params.toString()}` : "/api/menu";
            const res = await fetch(url, { cache: "no-store" });
            const raw: unknown = await res.json().catch(() => null);
            const list = parseMenuResponse(raw);

            const normalized: NormalizedMenuItem[] = list.map((m) => {
                const rec = isRecord(m) ? (m as unknown as Record<string, unknown>) : {};

                const category = normalizeCategory(rec.category);

                const serve_prices = normalizeServePrices(rec.serve_prices);
                const serve_types_from_prices = serve_prices.map((x) => x.serve_type);

                const serve_types_fallback = normalizeServeTypes(rec.serve_types);

                const serve_types =
                    serve_types_from_prices.length > 0
                        ? Array.from(new Set(serve_types_from_prices))
                        : serve_types_fallback;
                const is_enabled_in_branch =
                    typeof rec.is_enabled_in_branch === "boolean"
                        ? rec.is_enabled_in_branch
                        : true;

                return {
                    ...(m as unknown as Omit<MenuItem, "serve_types" | "category">),
                    category,
                    serve_types,
                    serve_prices,
                    is_enabled_in_branch,
                };
            });

            setMenuItems(normalized);
        } catch (err) {
            console.error("useMenuSearch → fetch error:", err);
            setMenuItems([]);
        } finally {
            setLoading(false);
        }
    }, [includeDisabled]);

    useEffect(() => {
        loadMenu();
    }, [loadMenu]);

    const refreshData = useCallback(() => loadMenu(), [loadMenu]);

    const debouncedSearch = useDebounceValue(search, 250);

    const filteredItems = useMemo(() => {
        let list = menuItems;

        if (categoryFilter !== "all") {
            list = list.filter((i) => i.category === categoryFilter);
        }

        if (serveFilter !== "all") {
            list = list.filter((i) => i.serve_types.includes(serveFilter));
        }

        const qRaw = debouncedSearch.trim();
        if (qRaw) {
            const q = qRaw.toLowerCase();

            list = list.filter((i) => {
                const name = asString(i.name).toLowerCase();
                const cat = asString(i.category).toLowerCase();
                const serves = i.serve_types.map((s) => s.toLowerCase());

                return name.includes(q) || cat.includes(q) || serves.some((s) => s.includes(q));
            });
        }

        return list;
    }, [menuItems, categoryFilter, serveFilter, debouncedSearch]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredItems.length / rowsPerPage)),
        [filteredItems.length, rowsPerPage]
    );

    const paginatedItems = useMemo(() => {
        const safePage = Math.min(Math.max(1, page), totalPages);
        const start = (safePage - 1) * rowsPerPage;
        return filteredItems.slice(start, start + rowsPerPage);
    }, [filteredItems, page, rowsPerPage, totalPages]);

    useEffect(() => {
        setPage(1);
        setInputPage("1");
    }, [debouncedSearch, categoryFilter, serveFilter]);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    return {
        loading,
        menuItems,
        filteredItems,
        paginatedItems,

        search,
        setSearch,

        categoryFilter,
        setCategoryFilter,
        serveFilter,
        setServeFilter,

        page,
        setPage,
        totalPages,
        inputPage,
        setInputPage,

        refreshData,
    };
}

/* ----------------------------- HOOK: useDebounceValue ----------------------------- */
function useDebounceValue<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);

    return debounced;
}
