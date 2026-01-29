// app/admin/menu/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import { Button } from "@/components/ui/button";

import SearchBox from "@/components/admin/search/SearchBox";
import Pagination from "@/components/admin/Pagination";
import useMenuSearch from "@/hooks/useMenuSearch";

import type { MenuItem, CategoryRow, ServeRow } from "@/lib/types";

import AddCategoryModal from "@/components/admin/AddCategoryModal";
import AddServeTypeModal from "@/components/admin/AddServeTypeModal";

import MenuFormModal, { MenuFormSubmitPayload } from "@/components/admin/modal/MenuFormModal";

import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";

/* ======================================================================
   SAFE HELPERS (NO any)
====================================================================== */
function safeTime(s: unknown): number {
    if (typeof s !== "string") return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function extractArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

function getFirstUrl(data: unknown): string {
    if (!isRecord(data)) return "";
    const urls = data.urls;
    if (!Array.isArray(urls)) return "";
    const first = urls[0];
    return typeof first === "string" ? first : "";
}

function formatPriceTHB(v: unknown): string {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "-";
    return `${n.toLocaleString("th-TH")}฿`;
}

function shortText(s: unknown, max = 54): string {
    const t = typeof s === "string" ? s.trim() : "";
    if (!t) return "";
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

type ServePrice = {
    serve_type: string;
    price: number;
    is_default: boolean;
    has_override: boolean;
};

function normalizeServePricesFromItem(item: MenuItem): ServePrice[] {
    const rec = isRecord(item) ? (item as unknown as Record<string, unknown>) : {};
    const raw = rec.serve_prices;
    if (!Array.isArray(raw)) return [];

    const out: ServePrice[] = [];
    for (const x of raw) {
        if (!isRecord(x)) continue;
        const serve_type = typeof x.serve_type === "string" ? x.serve_type.trim() : "";
        const price = typeof x.price === "number" ? x.price : Number(x.price);
        const is_default = Boolean(x.is_default);
        const has_override = Boolean(x.has_override);

        if (!serve_type) continue;
        if (!Number.isFinite(price) || price <= 0) continue;

        out.push({ serve_type, price, is_default, has_override });
    }

    const map = new Map<string, ServePrice>();
    for (const r of out) {
        const existing = map.get(r.serve_type);
        if (!existing) map.set(r.serve_type, r);
        else if (!existing.is_default && r.is_default) map.set(r.serve_type, r);
    }
    return Array.from(map.values());
}

/* ======================================================================
   MAIN PAGE
====================================================================== */
export default function MenuAdminPage() {
    const {
        loading,
        paginatedItems,
        totalPages,
        page,
        setPage,
        inputPage,
        setInputPage,
        search,
        setSearch,
        categoryFilter,
        setCategoryFilter,
        serveFilter,
        setServeFilter,
        refreshData,
    } = useMenuSearch({ rowsPerPage: 20 });

    /* ======================================================================
       LOAD CATEGORY + SERVE TYPES FROM DB
    ====================================================================== */
    const [categories, setCategories] = useState<string[]>([]);
    const [serveTypesDB, setServeTypesDB] = useState<string[]>([]);

    const loadCategoriesFromDB = useCallback(async () => {
        const res = await fetch("/api/menu/categories", { cache: "no-store" });
        const raw: unknown = await res.json().catch(() => []);
        const data = extractArray<CategoryRow>(raw);

        const sorted = data
            .slice()
            .sort((a, b) => safeTime(b.created_at) - safeTime(a.created_at))
            .map((x) => x.name)
            .filter(Boolean);

        setCategories(sorted);
    }, []);

    const loadServeTypesFromDB = useCallback(async () => {
        const res = await fetch("/api/menu/serves", { cache: "no-store" });
        const raw: unknown = await res.json().catch(() => []);
        const data = extractArray<ServeRow>(raw);

        const sorted = data
            .slice()
            .sort((a, b) => safeTime(b.created_at) - safeTime(a.created_at))
            .map((x) => x.name)
            .filter(Boolean);

        setServeTypesDB(sorted);
    }, []);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(async () => {
            if (cancelled) return;
            await Promise.all([loadCategoriesFromDB(), loadServeTypesFromDB()]);
        });
        return () => {
            cancelled = true;
        };
    }, [loadCategoriesFromDB, loadServeTypesFromDB]);

    /* Reload after closing modals */
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showServeModal, setShowServeModal] = useState(false);

    useEffect(() => {
        if (showCategoryModal) return;
        let cancelled = false;
        queueMicrotask(async () => {
            if (cancelled) return;
            await loadCategoriesFromDB();
        });
        return () => {
            cancelled = true;
        };
    }, [showCategoryModal, loadCategoriesFromDB]);

    useEffect(() => {
        if (showServeModal) return;
        let cancelled = false;
        queueMicrotask(async () => {
            if (cancelled) return;
            await loadServeTypesFromDB();
        });
        return () => {
            cancelled = true;
        };
    }, [showServeModal, loadServeTypesFromDB]);

    /* ======================================================================
       MENU MODAL STATE
    ====================================================================== */
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

    const openModal = (item?: MenuItem) => {
        setEditingItem(item ?? null);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingItem(null);
    };

    /* ======================================================================
       SAVE MENU
    ====================================================================== */
    const saveMenu = async (payload: MenuFormSubmitPayload) => {
        let imageUrl = editingItem?.image_url ?? "";

        if (payload.imageFile) {
            const fd = new FormData();
            fd.append("files", payload.imageFile);

            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                body: fd,
            });

            const uploadData: unknown = await uploadRes.json().catch(() => ({}));
            const url = getFirstUrl(uploadData);

            if (!uploadRes.ok || !url) {
                throw new Error("Image upload failed");
            }

            imageUrl = url;
        }

        const body = {
            name: payload.name,
            price: payload.price,
            category: payload.category,
            serveTypes: payload.serveTypes,
            servePricing: payload.servePricing,
            description: payload.description,
            image: imageUrl,
        };

        const isEdit = Boolean(payload.id);
        const method = isEdit ? "PUT" : "POST";

        const res = await fetch("/api/menu", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(isEdit ? { ...body, id: payload.id } : body),
        });

        if (!res.ok) {
            let msg = "บันทึกไม่สำเร็จ";
            try {
                const t: unknown = await res.json();
                if (isRecord(t) && typeof t.error === "string") msg = t.error;
            } catch { }
            throw new Error(msg);
        }

        refreshData();
    };

    /* ======================================================================
       DELETE MENU
    ====================================================================== */
    const deleteMenu = async (id: string) => {
        if (!confirm("Delete this item?")) return;

        const res = await fetch(`/api/menu?id=${id}`, { method: "DELETE" });
        if (!res.ok) {
            let msg = "ลบไม่สำเร็จ";
            try {
                const t: unknown = await res.json();
                if (isRecord(t) && typeof t.error === "string") msg = t.error;
            } catch { }
            alert(msg);
            return;
        }

        refreshData();
    };

    /* ======================================================================
       UX: FILTERS + CLEAR
    ====================================================================== */
    const hasActiveFilters =
        search.trim().length > 0 || categoryFilter !== "all" || serveFilter !== "all";

    const clearAll = () => {
        setSearch("");
        setCategoryFilter("all");
        setServeFilter("all");
        setPage(1);
        setInputPage("1");
    };

    /* === NEW: user-friendly labels for selects (แก้ "ทั้งหมด" งง ๆ) === */
    const categoryLabel = categoryFilter === "all" ? "หมวดเมนู: ทั้งหมด" : `หมวดเมนู: ${categoryFilter}`;
    const serveLabel = serveFilter === "all" ? "รูปแบบการขาย: ทั้งหมด" : `รูปแบบการขาย: ${serveFilter}`;

    /* ======================================================================
       Serve order map (serveTypesDB order)
    ====================================================================== */
    const serveOrderMap = useMemo(() => {
        const map = new Map<string, number>();
        serveTypesDB.forEach((s, i) => map.set(s, i));
        return map;
    }, [serveTypesDB]);

    function sortServePrices(prices: ServePrice[]): ServePrice[] {
        return prices
            .slice()
            .sort((a, b) => {
                const ia = serveOrderMap.has(a.serve_type) ? serveOrderMap.get(a.serve_type)! : 9999;
                const ib = serveOrderMap.has(b.serve_type) ? serveOrderMap.get(b.serve_type)! : 9999;
                if (ia !== ib) return ia - ib;
                return a.serve_type.localeCompare(b.serve_type);
            });
    }

    /* ======================================================================
       Row expand state
    ====================================================================== */
    const [expandedId, setExpandedId] = useState<string | null>(null);

    /* ======================================================================
       TABLE HEADERS
    ====================================================================== */
    const headers = ["Item", "Category", "Serve / Price", "Actions"];

    /* ======================================================================
       RENDER
    ====================================================================== */
    return (
        <div className="p-6 space-y-6">
            <Card title="Menu Management">
                {/* Filter bar */}
                <div className="sticky top-0 z-40 -mx-6 px-6 py-4 bg-[var(--background)]/80 backdrop-blur border-b border-[var(--text-muted)]/20">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-stretch justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-[260px]">
                                <div className="[&_input]:!h-10 [&_input]:!min-h-[40px] [&_input]:!rounded-lg [&_input]:!px-3 [&_input]:!text-sm [&_input]:!leading-none">
                                    <SearchBox
                                        value={search}
                                        setValue={setSearch}
                                        placeholder="ค้นหาเมนู / หมวดเมนู / รูปแบบการขาย"
                                    />
                                </div>
                            </div>

                            <div className="flex items-stretch gap-2 flex-wrap">
                                {/* Category */}
                                <div className="min-w-[220px] flex">
                                    <Select
                                        value={categoryFilter}
                                        onValueChange={(v) => {
                                            setCategoryFilter(v);
                                            setPage(1);
                                            setInputPage("1");
                                        }}
                                    >
                                        <SelectTrigger className="h-10 w-full">
                                            {/* ✅ render label ourselves so it never shows ambiguous "ทั้งหมด" */}
                                            <span className="text-sm truncate">{categoryLabel}</span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <div className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                                                กรองตาม “หมวดเมนู”
                                            </div>
                                            <SelectItem value="all">ทั้งหมด</SelectItem>
                                            {categories.map((c) => (
                                                <SelectItem key={c} value={c}>
                                                    {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Serve / Variant */}
                                <div className="min-w-[240px] flex">
                                    <Select
                                        value={serveFilter}
                                        onValueChange={(v) => {
                                            setServeFilter(v);
                                            setPage(1);
                                            setInputPage("1");
                                        }}
                                    >
                                        <SelectTrigger className="h-10 w-full">
                                            <span className="text-sm truncate">{serveLabel}</span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <div className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                                                กรองตาม “รูปแบบการขาย” (ร้อน/เย็น/ปั่น/ไซส์ ฯลฯ)
                                            </div>
                                            <SelectItem value="all">ทั้งหมด</SelectItem>
                                            {serveTypesDB.map((s) => (
                                                <SelectItem key={s} value={s}>
                                                    {s}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={clearAll}
                                    disabled={!hasActiveFilters}
                                    className="h-10"
                                >
                                    Clear
                                </Button>

                                <Button onClick={() => openModal()} className="h-10">
                                    + Add Menu
                                </Button>
                            </div>
                        </div>

                        {hasActiveFilters && (
                            <div className="flex items-center gap-2 flex-wrap">
                                {search.trim() && (
                                    <button
                                        onClick={() => setSearch("")}
                                        className="px-3 py-1.5 rounded-full text-sm bg-[var(--surface)] text-[var(--text-secondary)] hover:opacity-90 border border-[var(--text-muted)]/20"
                                        title="ลบ search"
                                    >
                                        Search: {search.trim()} ✕
                                    </button>
                                )}

                                {categoryFilter !== "all" && (
                                    <button
                                        onClick={() => setCategoryFilter("all")}
                                        className="px-3 py-1.5 rounded-full text-sm bg-[var(--surface)] text-[var(--text-secondary)] hover:opacity-90 border border-[var(--text-muted)]/20"
                                        title="ลบหมวดเมนู"
                                    >
                                        หมวดเมนู: {categoryFilter} ✕
                                    </button>
                                )}

                                {serveFilter !== "all" && (
                                    <button
                                        onClick={() => setServeFilter("all")}
                                        className="px-3 py-1.5 rounded-full text-sm bg-[var(--surface)] text-[var(--text-secondary)] hover:opacity-90 border border-[var(--text-muted)]/20"
                                        title="ลบรูปแบบการขาย"
                                    >
                                        รูปแบบการขาย: {serveFilter} ✕
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Table / Empty */}
                <div className="pt-4">
                    {loading ? (
                        <p>Loading...</p>
                    ) : paginatedItems.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="text-lg font-semibold">ไม่พบเมนู</div>
                            <div className="text-sm text-[var(--text-secondary)] mt-1">
                                ลอง Clear ฟิลเตอร์ หรือเพิ่มเมนูใหม่
                            </div>
                            <div className="mt-4 flex justify-center gap-2">
                                <Button variant="outline" onClick={clearAll} disabled={!hasActiveFilters}>
                                    Clear filters
                                </Button>
                                <Button onClick={() => openModal()}>+ Add Menu</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="[&_th:last-child]:text-left [&_th:last-child]:w-[220px] [&_td:last-child]:w-[220px] [&_td:last-child]:align-middle">
                            <div className="overflow-x-auto">
                                <Table
                                    headers={headers}
                                    data={paginatedItems.map((item) => {
                                        const servePrices = sortServePrices(normalizeServePricesFromItem(item));
                                        const isExpanded = expandedId === item.id;

                                        const visible = isExpanded ? servePrices : servePrices.slice(0, 3);
                                        const hiddenCount = Math.max(0, servePrices.length - visible.length);

                                        const serveCell =
                                            servePrices.length === 0 ? (
                                                <span className="text-sm text-[var(--text-secondary)]">—</span>
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {visible.map((sp) => (
                                                        <span
                                                            key={`${item.id}-${sp.serve_type}`}
                                                            className={[
                                                                "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border",
                                                                "bg-[var(--surface)] border-[var(--text-muted)]/20",
                                                                sp.is_default ? "ring-1 ring-[var(--accent)]/40" : "",
                                                            ].join(" ")}
                                                            title={sp.has_override ? "override price" : "base price"}
                                                        >
                                                            <span className="text-[var(--text-secondary)]">{sp.serve_type}</span>
                                                            <span className="font-semibold">{formatPriceTHB(sp.price)}</span>
                                                        </span>
                                                    ))}

                                                    {hiddenCount > 0 && (
                                                        <button
                                                            className="text-xs px-2.5 py-1 rounded-full border bg-[var(--surface)] border-[var(--text-muted)]/20 hover:opacity-90"
                                                            onClick={() => setExpandedId(item.id)}
                                                            title="ดูทั้งหมด"
                                                        >
                                                            +{hiddenCount} more
                                                        </button>
                                                    )}

                                                    {servePrices.length > 3 && isExpanded && (
                                                        <button
                                                            className="text-xs px-2.5 py-1 rounded-full border bg-[var(--surface)] border-[var(--text-muted)]/20 hover:opacity-90"
                                                            onClick={() => setExpandedId(null)}
                                                            title="ย่อ"
                                                        >
                                                            Hide
                                                        </button>
                                                    )}
                                                </div>
                                            );

                                        return [
                                            <div key={item.id} className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-lg bg-[var(--surface)] overflow-hidden flex items-center justify-center border border-[var(--text-muted)]/15">
                                                    {item.image_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={item.image_url}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-xs text-[var(--text-secondary)]">No img</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold leading-tight truncate">{item.name}</div>
                                                    <div className="text-xs text-[var(--text-secondary)] truncate">
                                                        {shortText(item.description, 54) || "—"}
                                                    </div>
                                                </div>
                                            </div>,
                                            item.category ?? "-",
                                            serveCell,
                                            <div
                                                key={item.id}
                                                className="w-full h-full flex items-center justify-start gap-2 py-2"
                                            >
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 px-4"
                                                    onClick={() => openModal(item)}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-9 px-4"
                                                    onClick={() => deleteMenu(item.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>,
                                        ];
                                    })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <Pagination
                    page={page}
                    setPage={setPage}
                    totalPages={totalPages}
                    inputPage={inputPage}
                    setInputPage={setInputPage}
                />
            </Card>

            {/* MENU FORM MODAL */}
            {showModal && (
                <MenuFormModal
                    key={editingItem?.id ?? "new"}
                    isOpen={true}
                    onClose={closeModal}
                    initialValues={editingItem}
                    categories={categories}
                    serveTypesDB={serveTypesDB}
                    onOpenCategoryModal={() => setShowCategoryModal(true)}
                    onOpenServeModal={() => setShowServeModal(true)}
                    onSubmit={saveMenu}
                />
            )}

            {/* CATEGORY MODAL */}
            <AddCategoryModal
                isOpen={showCategoryModal}
                onClose={() => setShowCategoryModal(false)}
                onAdded={loadCategoriesFromDB}
            />

            {/* SERVE TYPE MODAL */}
            <AddServeTypeModal
                isOpen={showServeModal}
                onClose={() => setShowServeModal(false)}
                onAdded={loadServeTypesFromDB}
            />
        </div>
    );
}
