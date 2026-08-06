// src/app/admin/ingredients/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import Link from "next/link";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

import SearchBox from "@/components/admin/search/SearchBox";
import Pagination from "@/components/admin/Pagination";
import AdjustStockForm from "@/components/admin/AdjustStockForm";

import DaysLeftBadge from "@/components/admin/DaysLeftBadge";
import { ingredientActionVisibility } from "@/lib/accessPolicy.mjs";

import type { IngredientRow } from "@/lib/types";
import { BASE_UNIT_LABEL, TYPE_LABEL, TYPE_TO_BASE, type IngredientType } from "@/lib/units";

type BaseUnit = "ml" | "g" | "piece";
type UnitFilter = "all" | BaseUnit;
type RiskFilter = "all" | "urgent" | "warn";
type DailyCloseStatus = "draft" | "closed" | "approved" | null;

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

function getBangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Bangkok",
    });
}

function readDailyCloseStatus(data: unknown): DailyCloseStatus {
    if (!isRecord(data) || !isRecord(data.close)) return null;
    const status = data.close.status;
    return status === "draft" || status === "closed" || status === "approved" ? status : null;
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

export default function IngredientsClient() {
    const searchParams = useSearchParams();
    const restockGuideRef = useRef<HTMLDivElement | null>(null);
    const restockStartRef = useRef<HTMLDivElement | null>(null);
    const [showRestockGuide, setShowRestockGuide] = useState(
        () => searchParams.get("intent") === "restock" && searchParams.get("source") === "cash-movement"
    );
    const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState<string | null>(null);
    const [flashIngredientId, setFlashIngredientId] = useState<string | null>(null);
    const [canManageIngredients, setCanManageIngredients] = useState(false);
    const [permissionLoading, setPermissionLoading] = useState(true);
    const actionVisibility = ingredientActionVisibility(canManageIngredients ? "owner" : "staff");

    // filters
    const [search, setSearch] = useState("");
    const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
    const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

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
    const [dailyCloseStatus, setDailyCloseStatus] = useState<DailyCloseStatus>(null);
    const [dailyCloseLoading, setDailyCloseLoading] = useState(true);

    const isAnyModalOpen = showModal || !!adjustItem;
    const isBusinessDayClosed = dailyCloseStatus === "closed" || dailyCloseStatus === "approved";
    const stockActionsDisabled =
        loading || saving || !!deletingId || isAnyModalOpen || !canManageIngredients || permissionLoading || isBusinessDayClosed;
    const renameDisabled = loading || saving || !!deletingId || isAnyModalOpen || !canManageIngredients || permissionLoading;
    const adjustDisabled = loading || saving || !!deletingId || isAnyModalOpen || !actionVisibility.canAdjust || permissionLoading || isBusinessDayClosed;

    useEffect(() => setInputPage(String(page)), [page]);

    useEffect(() => {
        const shouldGuide = searchParams.get("intent") === "restock" && searchParams.get("source") === "cash-movement";
        setShowRestockGuide(shouldGuide);
        if (!shouldGuide) return;
        const t = window.setTimeout(() => {
            if (isBusinessDayClosed) {
                restockGuideRef.current?.focus();
                return;
            }
            restockStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            const searchInput = restockStartRef.current?.querySelector("input:not([disabled])") as HTMLInputElement | null;
            searchInput?.focus();
        }, 150);
        return () => window.clearTimeout(t);
    }, [searchParams, isBusinessDayClosed]);

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

    useEffect(() => {
        let alive = true;

        async function loadDailyCloseStatus() {
            try {
                setDailyCloseLoading(true);
                const date = getBangkokToday();
                const res = await fetch(`/api/daily-close?date=${encodeURIComponent(date)}`, {
                    cache: "no-store",
                });
                const data: unknown = await res.json().catch(() => null);

                if (!alive) return;
                if (!res.ok) {
                    setDailyCloseStatus(null);
                    return;
                }

                setDailyCloseStatus(readDailyCloseStatus(data));
            } catch {
                if (alive) setDailyCloseStatus(null);
            } finally {
                if (alive) setDailyCloseLoading(false);
            }
        }

        void loadDailyCloseStatus();
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

            const a = analyticsMap[item.id];
            const risk = getRiskLevel(item, a);

            const matchRisk =
                riskFilter === "all"
                    ? true
                    : riskFilter === "urgent"
                        ? risk === "low"
                        : risk === "warn";

            return matchSearch && matchUnit && matchRisk;
        });
    }, [ingredients, search, unitFilter, riskFilter, analyticsMap]);

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

    useEffect(() => setPage(1), [search, unitFilter, riskFilter]);

    useEffect(() => {
        const ids = ingredients.map((x) => x.id).filter(Boolean);
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
    }, [ingredients, analyticsMap]);

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

        const sortRiskItems = (items: typeof riskList) =>
            [...items].sort((a, b) => {
                const ar = a.level === "low" ? 0 : 1;
                const br = b.level === "low" ? 0 : 1;
                if (ar !== br) return ar - br;

                const ad = a.daysLeft ?? 1e9;
                const bd = b.daysLeft ?? 1e9;
                if (ad !== bd) return ad - bd;

                return a.name.localeCompare(b.name, "th");
            });

        const topUrgent = sortRiskItems(riskList.filter((x) => x.level === "low")).slice(0, 3);
        const topWarn = sortRiskItems(riskList.filter((x) => x.level === "warn")).slice(0, 3);

        return { low, warn, topUrgent, topWarn };
    }, [ingredients, analyticsMap]);

    const applyRiskFilter = (next: RiskFilter) => {
        setRiskFilter(next);
        setSearch("");
        setPage(1);
    };

    const openAdd = () => {
        if (!actionVisibility.canCreate || permissionLoading) return;
        if (isBusinessDayClosed) {
            setActionNotice("วันนี้ปิดยอดแล้ว ไม่สามารถเพิ่มวัตถุดิบหรือปรับสต็อกของวันนี้ได้");
            return;
        }
        setAdjustItem(null);
        setEditingItem(null);
        setName("");
        setStock("");
        setType("liquid");
        setShowModal(true);
    };

    const openRename = (item: IngredientRow) => {
        if (!actionVisibility.canRename || permissionLoading) return;
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
                setRiskFilter("all");
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
            if (isBusinessDayClosed) {
                setActionNotice("วันนี้ปิดยอดแล้ว ไม่สามารถเพิ่มวัตถุดิบหรือปรับสต็อกของวันนี้ได้");
                return;
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
        if (isBusinessDayClosed) {
            setActionNotice("วันนี้ปิดยอดแล้ว ไม่สามารถเพิ่มวัตถุดิบหรือปรับสต็อกของวันนี้ได้");
            return;
        }
        if (adjustDisabled) return;
        setShowModal(false);
        setEditingItem(null);
        setAdjustItem(item);
    };

    const deleteIngredient = async (id: string) => {
        if (!actionVisibility.canArchive || permissionLoading) return;
        if (deletingId) return;
        if (isBusinessDayClosed) {
            setActionNotice("วันนี้ปิดยอดแล้ว ไม่สามารถเพิ่มวัตถุดิบหรือปรับสต็อกของวันนี้ได้");
            return;
        }
        if (!confirm("ย้ายวัตถุดิบนี้ไปคลังเก่าใช่ไหม?")) return;

        try {
            setDeletingId(id);
            const deletedName = ingredients.find((x) => x.id === id)?.name ?? "วัตถุดิบ";

            const res = await fetch(`/api/ingredients?id=${id}`, { method: "DELETE" });
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                alert(getErrorMessage(data) ?? "ย้ายเข้าคลังเก่าไม่สำเร็จ");
                return;
            }

            setIngredients((prev) => prev.filter((row) => row.id !== id));

            setAnalyticsMap((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });

            setActionNotice(`ย้าย "${deletedName}" ไปคลังเก่าแล้ว`);
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

    const showEmptyRiskHint =
        !loading &&
        riskFilter !== "all" &&
        sortedItems.length === 0 &&
        (analyticsLoading || Object.keys(analyticsMap).length === 0);
    const hasActiveFilters = search.trim() !== "" || unitFilter !== "all" || riskFilter !== "all";

    return (
        <div className="p-6 space-y-6">
            <Card title="คลังวัตถุดิบ">
                {showRestockGuide ? (
                    <div ref={restockGuideRef} tabIndex={-1} className="mb-4 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500/40 dark:text-emerald-200" role="status">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-semibold">บันทึกเงินออกแล้ว — เพิ่มวัตถุดิบที่ซื้อเข้าสต็อกให้ครบ</div>
                                <div className="mt-1 text-emerald-700 dark:text-emerald-100/90">
                                    เลือกวัตถุดิบและระบุจำนวนที่รับเข้าจริง เงินที่จ่ายไม่ได้ใช้คำนวณจำนวนสต็อกอัตโนมัติ
                                </div>
                                <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-100/80">
                                    {isBusinessDayClosed
                                        ? "บันทึกเงินออกสำเร็จแล้ว แต่วันนี้ปิดยอดแล้ว จึงไม่สามารถปรับสต็อกของวันนี้ได้"
                                        : "ขั้นตอน: ค้นหาหรือเลือกวัตถุดิบในตาราง แล้วกด “ปรับสต็อก” และเลือก “รับของเข้า”"}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRestockGuide(false)}
                                className="rounded-lg border border-emerald-500/30 px-2 py-1 text-xs hover:bg-emerald-500/10"
                                aria-label="ปิดคำแนะนำเพิ่มสต็อก"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                ) : null}
                {isBusinessDayClosed ? (
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        วันนี้ปิดยอดแล้ว — ไม่สามารถเพิ่มหรือปรับสต็อกของวันนี้ได้
                    </div>
                ) : null}
                {!permissionLoading && !canManageIngredients ? (
                    <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        คุณปรับสต็อกได้ แต่เจ้าของร้านเท่านั้นที่เพิ่ม เปลี่ยนชื่อ หรือนำวัตถุดิบเข้าคลังเก่าได้
                    </div>
                ) : null}
                {/* Filters */}
                <div ref={restockStartRef} className="mb-4 space-y-3">
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
                            onClick={() => applyRiskFilter(riskFilter === "urgent" ? "all" : "urgent")}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border
                ${riskFilter === "urgent"
                                    ? "bg-red-500/10 text-red-600 border-red-500/30"
                                    : "bg-surface text-text-secondary border-text-muted/25 hover:border-text-muted/40"
                                }`}
                            title="แสดงวัตถุดิบที่ควรจัดการวันนี้"
                        >
                            ต้องจัดการวันนี้
                            {summary.low > 0 ? (
                                <span className="ml-2 opacity-80 tabular-nums">({summary.low})</span>
                            ) : null}
                        </button>

                        <button
                            onClick={() => applyRiskFilter(riskFilter === "warn" ? "all" : "warn")}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border
                ${riskFilter === "warn"
                                    ? "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30"
                                    : "bg-surface text-text-secondary border-text-muted/25 hover:border-text-muted/40"
                                }`}
                            title="แสดงวัตถุดิบที่ใกล้หมดใน 7 วัน"
                        >
                            ใกล้หมดใน 7 วัน
                            {summary.warn > 0 ? (
                                <span className="ml-2 opacity-80 tabular-nums">({summary.warn})</span>
                            ) : null}
                        </button>

                        <span className="text-xs text-text-muted">
                            {analyticsLoading ? "กำลังคำนวณของใกล้หมด..." : dailyCloseLoading ? "กำลังตรวจสอบสถานะปิดยอด..." : null}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                {actionVisibility.canCreate ? (
                    <div className="flex justify-end mb-4 gap-2">
                        <Button onClick={openAdd} disabled={stockActionsDisabled}>
                            + เพิ่มวัตถุดิบ
                        </Button>
                    </div>
                ) : null}

                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    {/* urgent */}
                    <button
                        type="button"
                        onClick={() => applyRiskFilter("urgent")}
                        className={`group rounded-2xl border p-4 text-left transition hover:border-red-500/40 hover:bg-red-500/5 ${riskFilter === "urgent"
                            ? "border-red-500/40 bg-red-500/10"
                            : "border-text-muted/25 bg-surface"
                            }`}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-sm text-text-secondary">ควรจัดการวันนี้</div>
                                <div className="text-2xl font-semibold mt-1 tabular-nums text-text-primary">
                                    {summary.low} รายการ
                                </div>
                                <div className="text-xs text-text-muted mt-1">หมดแล้ว หรือคาดว่าจะหมดภายใน 3 วัน</div>
                            </div>
                            <div className="px-2 py-1 rounded-full text-xs border border-red-500/30 text-red-600 bg-red-500/10">
                                ด่วน
                            </div>
                        </div>

                        {summary.topUrgent.length ? (
                            <div className="mt-3 space-y-1">
                                {summary.topUrgent.map((x) => (
                                    <div key={x.id} className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                                        <span className="truncate font-medium text-text-primary underline-offset-2 group-hover:underline">{x.name}</span>
                                        <span className="text-text-muted whitespace-nowrap">{fmtDaysOwner(x.daysLeft)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 text-sm text-text-muted">ยังไม่มีรายการที่ต้องจัดการทันที</div>
                        )}
                        <div className="mt-3 text-xs font-medium text-red-600 dark:text-red-300">
                            คลิกเพื่อดูรายการด่วน
                        </div>
                    </button>

                    {/* warn */}
                    <button
                        type="button"
                        onClick={() => applyRiskFilter("warn")}
                        className={`group rounded-2xl border p-4 text-left transition hover:border-yellow-500/40 hover:bg-yellow-500/5 ${riskFilter === "warn"
                            ? "border-yellow-500/40 bg-yellow-500/10"
                            : "border-text-muted/25 bg-surface"
                            }`}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-sm text-text-secondary">ควรเตรียมสั่งเพิ่ม</div>
                                <div className="text-2xl font-semibold mt-1 tabular-nums text-text-primary">
                                    {summary.warn} รายการ
                                </div>
                                <div className="text-xs text-text-muted mt-1">คาดว่าจะหมดภายใน 7 วัน</div>
                            </div>
                            <div className="px-2 py-1 rounded-full text-xs border border-yellow-500/30 text-yellow-700 bg-yellow-500/10">
                                เฝ้าดู
                            </div>
                        </div>

                        {summary.topWarn.length ? (
                            <div className="mt-3 space-y-1">
                                {summary.topWarn.map((x) => (
                                    <div key={x.id} className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                                        <span className="truncate font-medium text-text-primary underline-offset-2 group-hover:underline">{x.name}</span>
                                        <span className="text-text-muted whitespace-nowrap">{fmtDaysOwner(x.daysLeft)}</span>
                                    </div>
                                ))}
                            </div>
                            ) : (
                                <div className="mt-3 text-sm text-text-muted">ยังไม่มีรายการที่ใกล้หมดในช่วงนี้</div>
                            )}
                        <div className="mt-3 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                            คลิกเพื่อดูรายการใกล้หมด
                        </div>
                    </button>
                </div>

                {showEmptyRiskHint ? (
                    <div className="py-8 text-center text-sm text-text-muted">
                        กำลังคำนวณของใกล้หมดจากการใช้ 7 วันล่าสุด...
                    </div>
                ) : null}

                {/* Table */}
                {loadError ? (
                    <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                        {loadError}
                    </div>
                ) : null}
                {loading ? (
                    <p className="text-text-muted">กำลังโหลดคลังวัตถุดิบ...</p>
                ) : paginatedItems.length === 0 ? (
                    <div className="rounded-xl border border-text-muted/20 bg-surface px-4 py-8 text-center">
                        <div className="font-medium text-text-primary">
                            {hasActiveFilters ? "ไม่พบวัตถุดิบที่ตรงกับเงื่อนไข" : "ยังไม่มีวัตถุดิบในคลัง"}
                        </div>
                        <div className="mt-1 text-sm text-text-muted">
                            {hasActiveFilters
                                ? "ลองล้างตัวกรองหรือค้นหาด้วยชื่ออื่น"
                                : !permissionLoading && !canManageIngredients
                                    ? "ยังไม่มีวัตถุดิบให้รับเข้า กรุณาแจ้งเจ้าของร้านให้เพิ่มวัตถุดิบก่อน"
                                    : "เพิ่มวัตถุดิบหลักของร้าน เช่น นม กาแฟ น้ำเชื่อม หรือแก้ว"}
                        </div>
                    </div>
                ) : (
                    <Table
                        headers={headers}
                        rowClassName={(rowIndex) => {
                            const item = paginatedItems[rowIndex];
                            if (!item) return undefined;
                            if (item.id === flashIngredientId) return "bg-emerald-500/10";
                            const risk = getRiskLevel(item, analyticsMap[item.id]);
                            if (risk === "low") return "bg-red-500/5";
                            if (risk === "warn") return "bg-yellow-500/5";
                            return undefined;
                        }}
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
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openAdjust(item)}
                                        disabled={adjustDisabled}
                                    >
                                        ปรับสต็อก
                                    </Button>

                                    {actionVisibility.canRename && actionVisibility.canArchive && !permissionLoading ? (
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
                                                    disabled={renameDisabled}
                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-background text-sm text-text-secondary disabled:opacity-60"
                                                >
                                                    เปลี่ยนชื่อ
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => deleteIngredient(item.id)}
                                                    disabled={stockActionsDisabled}
                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-600 text-sm disabled:opacity-60"
                                                >
                                                    {isDeletingThis ? "กำลังย้าย..." : "เก็บเข้าคลังเก่า"}
                                                </button>
                                            </div>
                                        </details>
                                    ) : null}
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
                        {!editingItem && isBusinessDayClosed ? (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                                วันนี้ปิดยอดแล้ว — ไม่สามารถเพิ่มหรือปรับสต็อกของวันนี้ได้
                            </div>
                        ) : null}
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

                            <Button onClick={saveIngredient} disabled={saving || (!editingItem && isBusinessDayClosed)}>
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
                            aria-label="ปิดข้อความแจ้งเตือน"
                        >
                            x
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
