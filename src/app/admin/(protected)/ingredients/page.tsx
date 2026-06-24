// src/app/admin/ingredients/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

import SearchBox from "@/components/admin/search/SearchBox";
import Pagination from "@/components/admin/Pagination";
import AdjustStockForm from "@/components/admin/AdjustStockForm";

import DaysLeftBadge from "@/components/admin/DaysLeftBadge";

import type { IngredientRow } from "@/lib/types";
import { BASE_UNIT_LABEL, TYPE_LABEL, TYPE_TO_BASE, type IngredientType } from "@/lib/units";

type BaseUnit = "ml" | "g" | "piece";
type UnitFilter = "all" | BaseUnit;

/* ================= helpers ================= */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function getErrorMessage(data: unknown): string | null {
    if (!isRecord(data)) return null;
    return typeof data.error === "string" ? data.error : null;
}

function extractArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (isRecord(data)) {
        if (Array.isArray(data.ingredients)) return data.ingredients;
        if (Array.isArray(data.items)) return data.items;
    }
    return [];
}

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

function toNumber(v: unknown, fallback = 0) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/* ===== stock status (fallback) ===== */

type StockStatus = "ok" | "low" | "out";

function getStockStatus(item: IngredientRow): StockStatus {
    const stock = toNumber(item.stock, 0);
    const min = toNumber((item as unknown as { min_stock?: unknown }).min_stock, 0);
    if (stock <= 0) return "out";
    if (stock <= min) return "low";
    return "ok";
}

function formatUpdatedAt(v: unknown): string {
    if (typeof v !== "string") return "-";
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}

/* ===== analytics ===== */

type AnalyticsRow = {
    ingredient_id: string;
    avgDailyUsage7: number;
    todayUsage: number;
    daysLeft: number | null;
    abnormalToday: boolean;
    unit: string | null;
};

function isSameAnalyticsRow(a: AnalyticsRow | undefined, b: AnalyticsRow): boolean {
    if (!a) return false;
    return (
        a.ingredient_id === b.ingredient_id &&
        a.avgDailyUsage7 === b.avgDailyUsage7 &&
        a.todayUsage === b.todayUsage &&
        a.daysLeft === b.daysLeft &&
        a.abnormalToday === b.abnormalToday &&
        a.unit === b.unit
    );
}

function isLowByDaysLeft(a: AnalyticsRow | undefined): boolean {
    if (!a) return false;
    if (a.daysLeft === null) return false;
    return a.daysLeft <= 7;
}

/* ===== owner summary ===== */

function fmtDaysOwner(daysLeft: number | null | undefined): string {
    if (daysLeft == null) return "ไม่มีการใช้";
    if (!Number.isFinite(daysLeft)) return "ไม่มีการใช้";
    if (daysLeft <= 0.9) return "วันนี้";
    if (daysLeft <= 1.9) return "พรุ่งนี้";
    return `อีก ${Math.ceil(daysLeft)} วัน`;
}

type RiskLevel = "low" | "warn" | "ok" | "none";

function getRiskLevel(item: IngredientRow, a: AnalyticsRow | undefined): RiskLevel {
    const r = item as unknown as { is_active?: unknown; archived_at?: unknown };
    const isActive = r.is_active === undefined ? true : Boolean(r.is_active);
    const isArchived = r.archived_at != null;
    if (!isActive || isArchived) return "none";

    if (a) {
        if (a.daysLeft === null) return "ok";
        if (a.daysLeft <= 3) return "low";
        if (a.daysLeft <= 7) return "warn";
        return "ok";
    }

    const status = getStockStatus(item);
    if (status === "out") return "low";
    if (status === "low") return "warn";
    return "ok";
}

/* ================= page ================= */

export default function IngredientsAdminPage() {
    const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState<string | null>(null);
    const [flashIngredientId, setFlashIngredientId] = useState<string | null>(null);
    const [canManageIngredients, setCanManageIngredients] = useState(false);
    const [permissionLoading, setPermissionLoading] = useState(true);

    // filters
    const [search, setSearch] = useState("");
    const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
    const [onlyLow, setOnlyLow] = useState(false);

    // pagination
    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("");
    const rowsPerPage = 20;

    // modals
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<IngredientRow | null>(null);
    const [adjustItem, setAdjustItem] = useState<IngredientRow | null>(null);

    // form
    const [name, setName] = useState("");
    const [stock, setStock] = useState<number | string>("");
    const [type, setType] = useState<IngredientType>("liquid");

    // actions lock
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // analytics
    const [analyticsMap, setAnalyticsMap] = useState<Record<string, AnalyticsRow>>({});
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    const isAnyModalOpen = showModal || !!adjustItem;
    const disableActions = loading || saving || !!deletingId || isAnyModalOpen || !canManageIngredients || permissionLoading;

    useEffect(() => setInputPage(String(page)), [page]);

    const fetchIngredients = async () => {
        try {
            setLoading(true);
            setLoadError(null);

            const res = await fetch("/api/ingredients", { cache: "no-store" });
            const data: unknown = await res.json().catch(() => null);
            if (!res.ok) {
                setIngredients([]);
                setLoadError(getErrorMessage(data) ?? "โหลดรายการวัตถุดิบไม่สำเร็จ");
                return;
            }

            const list = extractArray(data) as IngredientRow[];
            setIngredients(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error("fetchIngredients error:", err);
            setIngredients([]);
            setLoadError("โหลดรายการวัตถุดิบไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIngredients();
    }, []);

    useEffect(() => {
        if (!actionNotice) return;
        const t = setTimeout(() => setActionNotice(null), 2600);
        return () => clearTimeout(t);
    }, [actionNotice]);

    useEffect(() => {
        if (!flashIngredientId) return;
        const t = setTimeout(() => setFlashIngredientId(null), 2600);
        return () => clearTimeout(t);
    }, [flashIngredientId]);

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

    const refreshAfterAdjust = async (ingredientId?: string) => {
        setAdjustItem(null);
        await fetchIngredients();

        if (ingredientId) {
            setAnalyticsMap((prev) => {
                if (!prev[ingredientId]) return prev;
                const next = { ...prev };
                delete next[ingredientId];
                return next;
            });
        } else {
            setAnalyticsMap({});
        }
    };

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();

        return ingredients.filter((item) => {
            const itemName = typeof item.name === "string" ? item.name : "";
            const base = getRowBaseUnit(item);

            const matchSearch = itemName.toLowerCase().includes(q);
            const matchUnit = unitFilter === "all" ? true : base === unitFilter;

            const status = getStockStatus(item);
            const a = analyticsMap[item.id];

            const lowFlag = isLowByDaysLeft(a) || status !== "ok";
            const matchLow = onlyLow ? lowFlag : true;

            return matchSearch && matchUnit && matchLow;
        });
    }, [ingredients, search, unitFilter, onlyLow, analyticsMap]);

    const sortedItems = useMemo(() => {
        const arr = [...filteredItems];
        arr.sort((a, b) => {
            const aa = analyticsMap[a.id];
            const bb = analyticsMap[b.id];

            const aAb = aa?.abnormalToday ? 1 : 0;
            const bAb = bb?.abnormalToday ? 1 : 0;
            if (aAb !== bAb) return bAb - aAb;

            const aDL = aa?.daysLeft;
            const bDL = bb?.daysLeft;

            const aHas = typeof aDL === "number" && Number.isFinite(aDL);
            const bHas = typeof bDL === "number" && Number.isFinite(bDL);

            if (aHas !== bHas) return aHas ? -1 : 1;
            if (aHas && bHas) {
                if (aDL! !== bDL!) return aDL! - bDL!;
            }

            const an = (a.name ?? "").toString();
            const bn = (b.name ?? "").toString();
            return an.localeCompare(bn, "th");
        });
        return arr;
    }, [filteredItems, analyticsMap]);

    const totalPages = Math.ceil(sortedItems.length / rowsPerPage) || 1;

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const paginatedItems = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return sortedItems.slice(start, start + rowsPerPage);
    }, [sortedItems, page]);

    useEffect(() => setPage(1), [search, unitFilter, onlyLow]);

    useEffect(() => {
        const ids = paginatedItems.map((x) => x.id).filter(Boolean);
        if (ids.length === 0) return;

        const missing = ids.filter((id) => !analyticsMap[id]);
        if (missing.length === 0) return;

        let cancelled = false;

        (async () => {
            try {
                setAnalyticsLoading(true);

                const res = await fetch("/api/ingredients/analytics/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ingredient_ids: missing }),
                });

                if (!res.ok) return;

                const json: unknown = await res.json().catch(() => null);
                if (cancelled) return;

                const items = isRecord(json) && Array.isArray(json.items) ? (json.items as unknown[]) : [];

                const next: Record<string, AnalyticsRow> = {};
                for (const it of items) {
                    if (!isRecord(it)) continue;
                    const ingredient_id = typeof it.ingredient_id === "string" ? it.ingredient_id : "";
                    if (!ingredient_id) continue;

                    next[ingredient_id] = {
                        ingredient_id,
                        avgDailyUsage7: toNumber(it.avgDailyUsage7, 0),
                        todayUsage: toNumber(it.todayUsage, 0),
                        daysLeft: it.daysLeft === null ? null : toNumber(it.daysLeft, 0),
                        abnormalToday: Boolean(it.abnormalToday),
                        unit: typeof it.unit === "string" ? it.unit : null,
                    };
                }

                const nextEntries = Object.entries(next);
                if (nextEntries.length === 0) return;

                setAnalyticsMap((prev) => {
                    let changed = false;
                    const merged = { ...prev };

                    for (const [id, row] of nextEntries) {
                        if (!isSameAnalyticsRow(prev[id], row)) {
                            merged[id] = row;
                            changed = true;
                        }
                    }

                    return changed ? merged : prev;
                });
            } catch {
                // ignore
            } finally {
                if (!cancelled) setAnalyticsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paginatedItems]);

    const summary = useMemo(() => {
        const riskList = ingredients
            .map((item) => {
                const a = analyticsMap[item.id];
                const level = getRiskLevel(item, a);

                const daysLeft =
                    a?.daysLeft === null
                        ? null
                        : typeof a?.daysLeft === "number" && Number.isFinite(a.daysLeft)
                            ? a.daysLeft
                            : null;

                return {
                    id: item.id,
                    name: (item.name ?? "-").toString(),
                    level,
                    daysLeft,
                };
            })
            .filter((x) => x.level !== "none");

        let low = 0;
        let warn = 0;
        for (const x of riskList) {
            if (x.level === "low") low += 1;
            else if (x.level === "warn") warn += 1;
        }

        const topRisk = riskList
            .filter((x) => x.level === "low" || x.level === "warn")
            .sort((a, b) => {
                const ar = a.level === "low" ? 0 : 1;
                const br = b.level === "low" ? 0 : 1;
                if (ar !== br) return ar - br;

                const ad = a.daysLeft ?? 1e9;
                const bd = b.daysLeft ?? 1e9;
                if (ad !== bd) return ad - bd;

                return a.name.localeCompare(b.name, "th");
            })
            .slice(0, 3);

        return { low, warn, topRisk };
    }, [ingredients, analyticsMap]);

    const openAdd = () => {
        if (!canManageIngredients || permissionLoading) return;
        setAdjustItem(null);
        setEditingItem(null);
        setName("");
        setStock("");
        setType("liquid");
        setShowModal(true);
    };

    const openRename = (item: IngredientRow) => {
        if (!canManageIngredients || permissionLoading) return;
        setAdjustItem(null);
        setEditingItem(item);
        setName(item.name ?? "");
        setShowModal(true);
    };

    const closeModal = () => {
        if (saving) return;
        setShowModal(false);
    };

    const saveIngredient = async () => {
        if (saving) return;

        const trimmed = name.trim();
        if (!trimmed) return alert("กรุณาใส่ชื่อวัตถุดิบ");

        const isRename = !!editingItem;

        try {
            setSaving(true);

            if (isRename) {
                const res = await fetch("/api/ingredients", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: editingItem!.id, name: trimmed }),
                });

                const data: unknown = await res.json().catch(() => null);
                if (!res.ok) {
                    alert(getErrorMessage(data) ?? "เปลี่ยนชื่อไม่สำเร็จ");
                    return;
                }

                const editedId = editingItem!.id;
                const now = new Date().toISOString();
                setIngredients((prev) =>
                    prev.map((row) => (row.id === editedId ? { ...row, name: trimmed, updated_at: now } : row))
                );
                setSearch(trimmed);
                setUnitFilter("all");
                setOnlyLow(false);
                setPage(1);
                setFlashIngredientId(editedId);
                setActionNotice(`เปลี่ยนชื่อเป็น "${trimmed}" แล้ว`);
                setShowModal(false);
                setEditingItem(null);
                return;
            }

            const n = Number(stock);
            if (stock === "" || !Number.isFinite(n) || n < 0) {
                return alert("จำนวนสต็อกไม่ถูกต้อง");
            }

            const base_unit = TYPE_TO_BASE[type];

            const res = await fetch("/api/ingredients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: trimmed,
                    stock: n,
                    base_unit,
                    unit: base_unit,
                }),
            });

            const data: unknown = await res.json().catch(() => null);
            if (!res.ok) {
                alert(getErrorMessage(data) ?? "เพิ่มวัตถุดิบไม่สำเร็จ");
                return;
            }

            await fetchIngredients();
            setActionNotice(`เพิ่ม "${trimmed}" แล้ว`);
            setShowModal(false);
        } catch (err) {
            console.error("saveIngredient error:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setSaving(false);
        }
    };

    const openAdjust = (item: IngredientRow) => {
        if (!canManageIngredients || permissionLoading) return;
        if (saving) return;
        setShowModal(false);
        setEditingItem(null);
        setAdjustItem(item);
    };

    const deleteIngredient = async (id: string) => {
        if (!canManageIngredients || permissionLoading) return;
        if (deletingId) return;
        if (!confirm("ลบวัตถุดิบนี้ใช่ไหม?")) return;

        try {
            setDeletingId(id);
            const deletedName = ingredients.find((x) => x.id === id)?.name ?? "วัตถุดิบ";

            const res = await fetch(`/api/ingredients?id=${id}`, { method: "DELETE" });
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                alert(getErrorMessage(data) ?? "ลบไม่สำเร็จ");
                return;
            }

            setIngredients((prev) => prev.filter((row) => row.id !== id));

            setAnalyticsMap((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });

            setActionNotice(`ลบ "${deletedName}" แล้ว (ย้ายไป Archived)`);
        } catch (err) {
            console.error("deleteIngredient error:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setDeletingId(null);
        }
    };

    const headers = ["วัตถุดิบ", "คงเหลือ", "คาดว่าจะหมด", "อัปเดตล่าสุด", "จัดการ"];

    const unitTabs: { key: UnitFilter; label: string }[] = [
        { key: "all", label: "ทั้งหมด" },
        { key: "ml", label: BASE_UNIT_LABEL.ml },
        { key: "g", label: BASE_UNIT_LABEL.g },
        { key: "piece", label: BASE_UNIT_LABEL.piece },
    ];

    const showEmptyLowHint =
        !loading &&
        onlyLow &&
        sortedItems.length === 0 &&
        (analyticsLoading || Object.keys(analyticsMap).length === 0);

    return (
        <div className="p-6 space-y-6">
            <Card title="Ingredients">
                {!permissionLoading && !canManageIngredients ? (
                    <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                        Read-only mode: only owners can manage ingredients.
                    </div>
                ) : null}
                {/* Filters */}
                <div className="mb-4 space-y-3">
                    <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาวัตถุดิบ..." />

                    <div className="flex items-center gap-2 flex-wrap">
                        {unitTabs.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setUnitFilter(t.key)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border
                  ${unitFilter === t.key
                                        ? "bg-accent text-background border-accent"
                                        : "bg-surface text-text-secondary border-text-muted/25 hover:border-text-muted/40"
                                    }`}
                            >
                                {t.label}
                            </button>
                        ))}

                        <button
                            onClick={() => setOnlyLow((v) => !v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border
                ${onlyLow
                                    ? "bg-red-500/10 text-red-600 border-red-500/30"
                                    : "bg-surface text-text-secondary border-text-muted/25 hover:border-text-muted/40"
                                }`}
                            title="แสดงเฉพาะวัตถุดิบที่ใกล้หมด/หมดแล้ว (daysLeft<=7)"
                        >
                            ใกล้หมด / หมด
                            {summary.low + summary.warn > 0 ? (
                                <span className="ml-2 opacity-80 tabular-nums">({summary.low + summary.warn})</span>
                            ) : null}
                        </button>

                        <span className="text-xs text-text-muted">
                            {analyticsLoading ? "กำลังคำนวณการใช้..." : null}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end mb-4 gap-2">
                    <Button onClick={openAdd} disabled={disableActions}>
                        + เพิ่มวัตถุดิบ
                    </Button>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    {/* urgent */}
                    <div className="rounded-2xl border border-text-muted/25 bg-surface p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-sm text-text-secondary">ต้องสั่งด่วน</div>
                                <div className="text-2xl font-semibold mt-1 tabular-nums text-text-primary">
                                    {summary.low} รายการ
                                </div>
                                <div className="text-xs text-text-muted mt-1">เหลือ ≤ 3 วัน / หรือหมด</div>
                            </div>
                            <div className="px-2 py-1 rounded-full text-xs border border-red-500/30 text-red-600 bg-red-500/10">
                                🔴 ด่วน
                            </div>
                        </div>

                        {summary.topRisk.some((x) => x.level === "low") ? (
                            <div className="mt-3 space-y-1">
                                {summary.topRisk
                                    .filter((x) => x.level === "low")
                                    .slice(0, 3)
                                    .map((x) => (
                                        <div key={x.id} className="flex items-center justify-between text-sm text-text-secondary">
                                            <span className="truncate">{x.name}</span>
                                            <span className="text-text-muted">{fmtDaysOwner(x.daysLeft)}</span>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <div className="mt-3 text-sm text-text-muted">วันนี้ยังไม่มีตัวแดง 👍</div>
                        )}
                    </div>

                    {/* warn */}
                    <div className="rounded-2xl border border-text-muted/25 bg-surface p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-sm text-text-secondary">ใกล้หมด</div>
                                <div className="text-2xl font-semibold mt-1 tabular-nums text-text-primary">
                                    {summary.warn} รายการ
                                </div>
                                <div className="text-xs text-text-muted mt-1">เหลือ ≤ 7 วัน</div>
                            </div>
                            <div className="px-2 py-1 rounded-full text-xs border border-yellow-500/30 text-yellow-700 bg-yellow-500/10">
                                🟡 ระวัง
                            </div>
                        </div>

                        {summary.topRisk.some((x) => x.level === "warn") ? (
                            <div className="mt-3 space-y-1">
                                {summary.topRisk
                                    .filter((x) => x.level === "warn")
                                    .slice(0, 3)
                                    .map((x) => (
                                        <div key={x.id} className="flex items-center justify-between text-sm text-text-secondary">
                                            <span className="truncate">{x.name}</span>
                                            <span className="text-text-muted">{fmtDaysOwner(x.daysLeft)}</span>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <div className="mt-3 text-sm text-text-muted">ตัวเหลืองยังว่างๆ อยู่</div>
                        )}
                    </div>
                </div>

                {showEmptyLowHint ? (
                    <div className="py-8 text-center text-sm text-text-muted">
                        กำลังคำนวณ “ของใกล้หมด” จากการใช้ 7 วันล่าสุด...
                    </div>
                ) : null}

                {/* Table */}
                {loadError ? (
                    <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                        {loadError}
                    </div>
                ) : null}
                {loading ? (
                    <p className="text-text-muted">Loading...</p>
                ) : (
                    <Table
                        headers={headers}
                        rowClassName={(rowIndex) =>
                            paginatedItems[rowIndex]?.id === flashIngredientId
                                ? "bg-emerald-500/10"
                                : undefined
                        }
                        data={paginatedItems.map((item) => {
                            const base = getRowBaseUnit(item);
                            const unitLabel = BASE_UNIT_LABEL[base];

                            const a = analyticsMap[item.id];
                            const isDeletingThis = deletingId === item.id;

                            return [
                                <Link
                                    key={`${item.id}-name`}
                                    href={`/admin/ingredients/${item.id}`}
                                    className="block"
                                    title="ดูรายละเอียด"
                                >
                                    <div className="font-medium text-text-primary hover:underline">{item.name ?? "-"}</div>
                                </Link>,

                                <div key={`${item.id}-stock`} className="font-semibold tabular-nums text-text-primary">
                                    {toNumber(item.stock, 0)}{" "}
                                    <span className="text-xs text-text-muted font-normal">{unitLabel}</span>
                                </div>,

                                <div key={`${item.id}-daysleft`} className="flex items-center gap-2">
                                    <DaysLeftBadge daysLeft={a?.daysLeft ?? null} abnormal={a?.abnormalToday ?? false} />
                                </div>,

                                <div
                                    key={`${item.id}-updated`}
                                    className="text-sm text-text-secondary whitespace-pre-line"
                                >
                                    {formatUpdatedAt((item as unknown as { updated_at?: unknown }).updated_at).replace(" ", "\n")}
                                </div>,

                                <div key={`${item.id}-actions`} className="flex items-center gap-2">
                                    {canManageIngredients && !permissionLoading ? (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openAdjust(item)}
                                                disabled={disableActions}
                                            >
                                                ปรับสต็อก
                                            </Button>

                                            <details className="relative">
                                                <summary className="list-none cursor-pointer px-3 py-2 rounded-lg border border-text-muted/25 hover:bg-surface text-sm text-text-secondary">
                                                    ⋯
                                                </summary>

                                                <div className="absolute right-0 mt-2 w-44 rounded-xl border border-text-muted/25 bg-surface/95 backdrop-blur p-2 shadow-lg z-50">
                                                    <Link
                                                        href={`/admin/ingredients/${item.id}`}
                                                        className="block px-3 py-2 rounded-lg hover:bg-background text-sm text-text-secondary"
                                                    >
                                                        รายละเอียด
                                                    </Link>

                                                    <button
                                                        type="button"
                                                        onClick={() => openRename(item)}
                                                        disabled={disableActions}
                                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-background text-sm text-text-secondary disabled:opacity-60"
                                                    >
                                                        เปลี่ยนชื่อ
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => deleteIngredient(item.id)}
                                                        disabled={disableActions}
                                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-600 text-sm disabled:opacity-60"
                                                    >
                                                        {isDeletingThis ? "กำลังลบ..." : "ลบ"}
                                                    </button>
                                                </div>
                                            </details>
                                        </>
                                    ) : (
                                        <span className="text-xs text-[var(--text-secondary)]">View only</span>
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

            {/* Add / Rename Modal */}
            {showModal && (
                <Modal isOpen={showModal} onClose={closeModal} title={editingItem ? "เปลี่ยนชื่อวัตถุดิบ" : "เพิ่มวัตถุดิบ"}>
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="ชื่อวัตถุดิบ"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={saving}
                            className="w-full border border-text-muted/25 rounded-md p-2 bg-background text-text-primary placeholder:text-text-muted disabled:opacity-60 disabled:cursor-not-allowed"
                        />

                        {!editingItem ? (
                            <>
                                <input
                                    type="number"
                                    placeholder="จำนวนเริ่มต้น"
                                    value={stock}
                                    onChange={(e) => setStock(e.target.value)}
                                    disabled={saving}
                                    className="w-full border border-text-muted/25 rounded-md p-2 bg-background text-text-primary placeholder:text-text-muted disabled:opacity-60 disabled:cursor-not-allowed"
                                />

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-text-primary">ประเภทวัตถุดิบ</label>
                                    <select
                                        value={type}
                                        onChange={(e) => setType(e.target.value as IngredientType)}
                                        disabled={saving}
                                        className="w-full border border-text-muted/25 rounded-md p-2 bg-background text-text-primary disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <option value="liquid">{TYPE_LABEL.liquid}</option>
                                        <option value="powder">{TYPE_LABEL.powder}</option>
                                        <option value="piece">{TYPE_LABEL.piece}</option>
                                    </select>

                                    <div className="text-sm text-text-secondary">
                                        หน่วยที่ระบบใช้เก็บ: <b className="text-text-primary">{BASE_UNIT_LABEL[TYPE_TO_BASE[type]]}</b>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-xs text-text-muted">
                                *สต็อกแก้ผ่าน <b className="text-text-secondary">ปรับสต็อก</b> เท่านั้น
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeModal} disabled={saving}>
                                ยกเลิก
                            </Button>

                            <Button onClick={saveIngredient} disabled={saving}>
                                {saving ? "กำลังบันทึก..." : editingItem ? "บันทึกชื่อ" : "เพิ่ม"}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Adjust Modal */}
            {adjustItem && (
                <AdjustStockForm
                    ingredient={adjustItem}
                    onClose={() => setAdjustItem(null)}
                    onUpdated={() => refreshAfterAdjust(adjustItem.id)}
                />
            )}

            {actionNotice ? (
                <div
                    className="fixed bottom-5 right-5 z-[70] rounded-xl border border-green-500/30 bg-surface/95 px-4 py-3 text-sm text-text-primary shadow-lg backdrop-blur"
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-start gap-3">
                        <span>{actionNotice}</span>
                        <button
                            type="button"
                            onClick={() => setActionNotice(null)}
                            className="text-text-muted hover:text-text-secondary"
                            aria-label="close notice"
                        >
                            x
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
