// app/admin/stock/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

import Card from "@/components/admin/Card";
import QuickDateFilter from "@/components/admin/QuickDateFilter";
import SearchBox from "@/components/admin/search/SearchBox";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";

import useStockSearch, { StockEvent, CriticalItem } from "@/hooks/useStockSearch";

/* =========================
   Helpers
========================= */
function fmtTimeShortTH(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function fmtTimeFullTH(iso: string) {
    return new Date(iso).toLocaleString("th-TH");
}

function fmtSignedImpactCompact(ev: StockEvent) {
    const parts: string[] = [];
    const addPart = (n: number, unit: string) => {
        if (!n) return;
        const sign = n > 0 ? "+" : "−";
        parts.push(`${sign}${Math.abs(n)} ${unit}`);
    };

    addPart(ev.impact_by_unit.g || 0, "g");
    addPart(ev.impact_by_unit.ml || 0, "ml");
    addPart(ev.impact_by_unit.piece || 0, "ชิ้น");

    if (!parts.length) return "ไม่เปลี่ยนสต็อก";
    if (parts.length <= 2) return parts.join(" • ");
    return `${parts[0]} • ${parts[1]} (+${parts.length - 2})`;
}

function fmtSignedImpactFull(ev: StockEvent) {
    const parts: string[] = [];
    const addPart = (n: number, unit: string) => {
        if (!n) return;
        const sign = n > 0 ? "+" : "−";
        parts.push(`${sign}${Math.abs(n)} ${unit}`);
    };
    addPart(ev.impact_by_unit.g || 0, "g");
    addPart(ev.impact_by_unit.ml || 0, "ml");
    addPart(ev.impact_by_unit.piece || 0, "ชิ้น");
    return parts.length ? parts.join(" • ") : "ไม่เปลี่ยนสต็อก";
}

function rowFlags(ev: StockEvent) {
    const flags: string[] = [];
    if (ev.flags?.has_big_amount) flags.push("⚠");
    return flags.length ? flags.join(" ") : "";
}

function isSaleContext(ev: StockEvent): boolean {
    const t = ev.title ?? "";
    if (t.includes("ขายผ่าน POS")) return true;
    if (ev.order_id) return true;
    const lines = ev.order_menu_lines as unknown as OrderHintLine[] | undefined;
    if (lines && lines.length > 0) return true;
    return false;
}

function stockActionMeta(ev: StockEvent) {
    switch (ev.type) {
        case "add":
            return {
                label: "เพิ่มสต็อก",
                className: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
            };
        case "restock":
            return {
                label: "คืนสต็อก",
                className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            };
        case "waste":
            return {
                label: "ของเสีย",
                className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
            };
        case "deduct":
            return {
                label: isSaleContext(ev) ? "ขาย" : "ตัดออก",
                className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
            };
        case "adjust":
            return {
                label: "ปรับยอด",
                className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
            };
        default:
            return {
                label: "ปรับยอด",
                className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
            };
    }
}

function fmtAbs(n: number) {
    return Math.round(Math.abs(n));
}

function fmtUnitBlock(label: string, val: number, unit: string) {
    const n = fmtAbs(val);
    if (!n) return null;
    return (
        <div className="text-xs text-[var(--text-muted)]">
            {label ? (
                <span className="text-[var(--text-muted)] mr-2">{label}</span>
            ) : null}
            <span className="text-sm font-semibold text-[var(--text)]">{n}</span>{" "}
            <span className="text-[var(--text-muted)]">{unit}</span>
        </div>
    );
}

function fallbackDelta(type: StockEvent["type"], amount: number) {
    if (type === "deduct" || type === "waste") return -Math.abs(amount);
    return Math.abs(amount);
}

function fmtSignedItemChange(type: StockEvent["type"], amount: number, delta: number | null, unit: string | null) {
    const value = delta ?? fallbackDelta(type, amount);
    const rounded = Math.round(value);
    const sign = rounded > 0 ? "+" : "";
    const unitText = unit ? ` ${unit}` : "";
    return `${sign}${rounded}${unitText}`;
}

function criticalChip(c: CriticalItem) {
    const danger = c.status === "out";
    return danger ? "หมด" : "ใกล้หมด";
}

function criticalNumberText(c: CriticalItem) {
    const s = Math.round(c.current_stock);
    const m = Math.round(c.min_stock);
    return `${s}/${m} ${c.base_unit}`;
}

type OrderHintLine = {
    menu_name: string;
    serve_type: string | null;
    size: string | null;
    qty: number;
};

function buildOrderMenuHint(lines?: OrderHintLine[]) {
    if (!lines || lines.length === 0) return null;

    const sorted = [...lines].sort((a, b) => b.qty - a.qty || a.menu_name.localeCompare(b.menu_name));
    const top = sorted[0];

    const meta: string[] = [];
    if (top.serve_type) meta.push(top.serve_type);
    if (top.size && top.size !== "default") meta.push(top.size);

    const metaText = meta.length ? ` (${meta.join(" / ")})` : "";
    const more = sorted.length > 1 ? ` +อีก ${sorted.length - 1}` : "";

    return `ขาย: ${top.menu_name}${metaText} x${top.qty}${more}`;
}

function hintForReference(ev: StockEvent) {
    const orderHint = buildOrderMenuHint(ev.order_menu_lines as unknown as OrderHintLine[] | undefined);
    if (ev.order_id && orderHint) return orderHint;
    if (ev.subtitle) return ev.subtitle;
    if (ev.note) return ev.note;
    return "-";
}

/* =========================
   Page
========================= */
export default function StockHistoryPage() {
    const {
        loading,
        loadingKpi,
        loadingCritical,

        // events
        events,
        paginatedEvents,
        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,

        // filters
        dateFilter,
        setDateFilter,
        search,
        setSearch,

        // decision area
        kpi,
        criticalItems,
        criticalCount,
    } = useStockSearch({ rowsPerPage: 20, initialFilter: "today" });

    /* Modal */
    const [selectedEvent, setSelectedEvent] = useState<StockEvent | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openEvent = (ev: StockEvent) => {
        setSelectedEvent(ev);
        setIsModalOpen(true);
    };
    const closeEvent = () => {
        setSelectedEvent(null);
        setIsModalOpen(false);
    };

    // ✅ ใหม่: 3 columns แบบร้านจริง
    const headers = ["เวลา", "เหตุการณ์", "จำนวนที่เปลี่ยน"];

    const rows = useMemo(() => {
        return paginatedEvents.map((ev) => {
            const timeText = fmtTimeShortTH(ev.happened_at);
            const flags = rowFlags(ev);

            const ref = hintForReference(ev);
            const impact = fmtSignedImpactCompact(ev);

            const action = stockActionMeta(ev);

            return [
                <div key={`${ev.event_id}-time`} className="whitespace-nowrap">
                    <div className="font-medium tabular-nums">{timeText}</div>
                    <span
                        className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${action.className}`}
                    >
                        {action.label}
                    </span>
                </div>,

                <div key={`${ev.event_id}-what`} className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                        <span className="truncate">{ev.title}</span>
                        {flags ? (
                            <span className="text-xs text-[var(--text-muted)]">{flags}</span>
                        ) : null}
                    </div>

                    {ref !== "-" ? (
                        <div className="text-sm truncate mt-0.5">{ref}</div>
                    ) : null}

                    {ev.order_id ? (
                        <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                            ออเดอร์ #{String(ev.order_id).slice(0, 10)}…
                        </div>
                    ) : null}
                </div>,

                <div key={`${ev.event_id}-impact`} className="whitespace-nowrap">
                    <div className="text-sm font-semibold">{impact}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                        รวม {ev.items_count} รายการ
                    </div>
                </div>,
            ];
        });
    }, [paginatedEvents]);

    // Top items in modal
    const topItems = useMemo(() => {
        if (!selectedEvent) return [];
        const items = selectedEvent.items ?? [];
        const sorted = [...items].sort((a, b) => {
            const aScore = a.delta != null ? Math.abs(a.delta) : Math.abs(Number(a.amount ?? 0));
            const bScore = b.delta != null ? Math.abs(b.delta) : Math.abs(Number(b.amount ?? 0));
            return bScore - aScore;
        });
        return sorted.slice(0, 3);
    }, [selectedEvent]);

    const selectedAction = selectedEvent ? stockActionMeta(selectedEvent) : null;

    const criticalTop = useMemo(() => {
        const out = criticalItems.filter((x) => x.status === "out");
        const low = criticalItems.filter((x) => x.status === "low");
        return [...out, ...low].slice(0, 8);
    }, [criticalItems]);

    return (
        <div className="p-6 space-y-6">
            {/* =========================
               KPI + Critical (Decision Area)
            ========================= */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* KPI */}
                <Card title="สรุปช่วงเวลา">
                    <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="text-sm">
                                <div className="text-[var(--text-muted)]">สถานะคลัง</div>
                                <div className="text-2xl font-semibold leading-tight">
                                    {loadingKpi ? "…" : String(criticalCount || kpi.critical_count || 0)}
                                    <span className="text-sm text-[var(--text-muted)] ml-2">รายการวิกฤต</span>
                                </div>
                            </div>

                            <Link
                                href="/admin/ingredients"
                                className="text-sm px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5"
                            >
                                ไปหน้าวัตถุดิบ →
                            </Link>
                        </div>

                        <div className="rounded-xl border border-white/10 p-3 bg-white/5">
                            <div className="text-xs text-[var(--text-muted)] mb-2">สรุปเข้า-ออกตามหน่วยหลัก</div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-white/10 p-3 bg-black/20">
                                    <div className="text-xs text-[var(--text-muted)] mb-2">ของเข้า</div>
                                    {loadingKpi ? (
                                        <div className="text-sm text-[var(--text-muted)]">กำลังโหลด…</div>
                                    ) : (
                                        <div className="space-y-1">
                                            {fmtUnitBlock("", kpi.inflow.g, "g")}
                                            {fmtUnitBlock("", kpi.inflow.ml, "ml")}
                                            {fmtUnitBlock("", kpi.inflow.piece, "ชิ้น")}
                                            {!fmtAbs(kpi.inflow.g) &&
                                                !fmtAbs(kpi.inflow.ml) &&
                                                !fmtAbs(kpi.inflow.piece) ? (
                                                <div className="text-sm text-[var(--text-muted)]">-</div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-white/10 p-3 bg-black/20">
                                    <div className="text-xs text-[var(--text-muted)] mb-2">ของออก</div>
                                    {loadingKpi ? (
                                        <div className="text-sm text-[var(--text-muted)]">กำลังโหลด…</div>
                                    ) : (
                                        <div className="space-y-1">
                                            {fmtUnitBlock("", kpi.outflow.g, "g")}
                                            {fmtUnitBlock("", kpi.outflow.ml, "ml")}
                                            {fmtUnitBlock("", kpi.outflow.piece, "ชิ้น")}
                                            {!fmtAbs(kpi.outflow.g) &&
                                                !fmtAbs(kpi.outflow.ml) &&
                                                !fmtAbs(kpi.outflow.piece) ? (
                                                <div className="text-sm text-[var(--text-muted)]">-</div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-[var(--text-muted)]">
                            * ตัวเลขนี้ช่วย “จับความผิดปกติ” ได้ไว (ของเข้าเยอะแต่ขายไม่ขึ้น / ของออกแรงผิดปกติ)
                        </div>
                    </div>
                </Card>

                {/* Critical list */}
                <div className="lg:col-span-2">
                    <Card title="ใกล้หมด / หมดแล้ว (ต้องจัดการก่อน)">
                        {loadingCritical ? (
                            <p>กำลังโหลด...</p>
                        ) : criticalTop.length === 0 ? (
                            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
                                <div className="text-sm font-semibold">วันนี้สต็อกยังโอเค</div>
                                <div className="text-xs text-[var(--text-muted)]">
                                    ไม่มีวัตถุดิบต่ำกว่าจุดสั่งซื้อขั้นต่ำ
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {criticalTop.map((c) => (
                                    <div
                                        key={c.ingredient_id}
                                        className="rounded-xl border border-white/10 p-3 bg-white/5 flex items-start justify-between gap-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-semibold truncate">{c.name}</div>
                                            <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/20">
                                                    {criticalChip(c)}
                                                </span>
                                                <span className="truncate">{criticalNumberText(c)}</span>
                                            </div>
                                        </div>

                                        <Link
                                            href={`/admin/ingredients/${encodeURIComponent(c.ingredient_id)}`}
                                            className="text-xs px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 whitespace-nowrap"
                                        >
                                            ดู/ปรับ →
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-3 text-xs text-[var(--text-muted)]">
                            Tip: ตั้งจุดสั่งซื้อขั้นต่ำให้ของสำคัญ เช่น นม กาแฟ น้ำแข็ง สูงไว้ก่อน แล้วค่อยไล่ปรับ
                        </div>
                    </Card>
                </div>
            </div>

            {/* =========================
               Timeline (Logs / Events)
            ========================= */}
            <Card title="ประวัติสต็อก">
                <QuickDateFilter dateFilter={dateFilter} setDateFilter={setDateFilter} />

                <SearchBox
                    value={search}
                    setValue={setSearch}
                    placeholder="ค้นหา: วัตถุดิบ / เมนู / ออเดอร์ / หมายเหตุ"
                />

                {loading ? (
                    <p>กำลังโหลด...</p>
                ) : events.length === 0 ? (
                    <p className="text-[var(--text-muted)]">ไม่พบข้อมูล</p>
                ) : (
                    <>
                        <Table
                            headers={headers}
                            data={rows}
                            onRowClick={(i) => {
                                const ev = paginatedEvents[i];
                                if (ev) openEvent(ev);
                            }}
                        />

                        <div className="mt-4">
                            <Pagination
                                page={page}
                                setPage={setPage}
                                inputPage={inputPage}
                                setInputPage={setInputPage}
                                totalPages={totalPages}
                            />
                            <div className="mt-2 text-xs text-[var(--text-muted)]">
                                แสดง {paginatedEvents.length} จาก {events.length} รายการ
                            </div>
                        </div>
                    </>
                )}
            </Card>

            {/* =========================
               Detail modal (เหมือนเดิม)
            ========================= */}
            {isModalOpen && selectedEvent ? (
                <Modal isOpen={isModalOpen} onClose={closeEvent} title="รายละเอียดเหตุการณ์">
                    <div className="space-y-4 text-sm">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-base font-semibold truncate flex items-center gap-2">
                                    <span className="truncate">{selectedEvent.title}</span>
                                    {selectedAction ? (
                                        <span
                                            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${selectedAction.className}`}
                                        >
                                            {selectedAction.label}
                                        </span>
                                    ) : null}
                                    {rowFlags(selectedEvent) ? (
                                        <span className="text-xs text-[var(--text-muted)]">
                                            {rowFlags(selectedEvent)}
                                        </span>
                                    ) : null}
                                </div>
                                {selectedEvent.order_id ? (
                                    <div className="text-xs text-[var(--text-muted)] truncate">
                                        ออเดอร์ #{String(selectedEvent.order_id).slice(0, 18)}…
                                    </div>
                                ) : selectedEvent.subtitle ? (
                                    <div className="text-xs text-[var(--text-muted)] truncate">
                                        {selectedEvent.subtitle}
                                    </div>
                                ) : null}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                                {fmtTimeFullTH(selectedEvent.happened_at)}
                            </div>
                        </div>

                        {/* Context / Reference */}
                        <div className="rounded-xl border border-white/10 p-3 bg-white/5 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-[var(--text-muted)]">ที่มา</div>
                                <div className="font-semibold">{fmtSignedImpactFull(selectedEvent)}</div>
                            </div>

                            {selectedEvent.order_id && selectedEvent.order_menu_lines?.length ? (
                                <div className="mt-2">
                                    <div className="text-xs text-[var(--text-muted)] mb-2">
                                        เมนูในออเดอร์ ({selectedEvent.order_menu_lines.length})
                                    </div>
                                    <div className="space-y-2">
                                        {selectedEvent.order_menu_lines.map((l) => {
                                            const meta: string[] = [];
                                            if (l.serve_type) meta.push(l.serve_type);
                                            if (l.size && l.size !== "default") meta.push(l.size);
                                            const metaText = meta.length ? ` (${meta.join(" / ")})` : "";
                                            return (
                                                <div
                                                    key={l.order_item_id}
                                                    className="rounded-lg border border-white/10 px-3 py-2 bg-black/20 flex items-center justify-between gap-3"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium">
                                                            {l.menu_name}
                                                            <span className="text-xs text-[var(--text-muted)]">
                                                                {metaText}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-[var(--text-muted)]">
                                                            x{l.qty} • {l.price} บาท
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm">{hintForReference(selectedEvent)}</div>
                            )}

                            {selectedEvent.note ? (
                                <div className="text-xs text-[var(--text-muted)]">หมายเหตุ: {selectedEvent.note}</div>
                            ) : null}
                        </div>

                        {/* Largest item changes */}
                        {topItems.length ? (
                            <div className="rounded-xl border border-white/10 p-3">
                                <div className="text-xs text-[var(--text-muted)] mb-2">เปลี่ยนเยอะสุด</div>
                                <div className="space-y-2">
                                    {topItems.map((it) => {
                                        const delta = it.delta ?? null;
                                        const changeText = fmtSignedItemChange(
                                            selectedEvent.type,
                                            Number(it.amount ?? 0),
                                            delta,
                                            it.unit
                                        );

                                        return (
                                            <div
                                                key={`top-${it.id}`}
                                                className="rounded-lg border border-white/10 px-3 py-2 flex items-center justify-between gap-3 bg-white/5"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium">
                                                        {it.ingredient_name ?? "-"}
                                                        {it.flags.big_amount ? (
                                                            <span className="ml-2 text-xs text-red-500">⚠</span>
                                                        ) : null}
                                                    </div>
                                                    {delta != null ? (
                                                        <div className="text-xs text-[var(--text-muted)]">
                                                            เปลี่ยน {changeText}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-[var(--text-muted)]">
                                                            เปลี่ยน {changeText}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-right whitespace-nowrap">
                                                    <div className="font-semibold">
                                                        {changeText}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        {/* All ingredient impacts */}
                        <div className="rounded-xl border border-white/10 p-3">
                            <div className="text-xs text-[var(--text-muted)] mb-2">
                                รายการวัตถุดิบที่เปลี่ยน ({selectedEvent.items_count})
                            </div>

                            <div className="space-y-2">
                                {selectedEvent.items.map((it) => {
                                    const delta = it.delta ?? null;
                                    const changeText = fmtSignedItemChange(
                                        selectedEvent.type,
                                        Number(it.amount ?? 0),
                                        delta,
                                        it.unit
                                    );

                                    return (
                                        <div
                                            key={it.id}
                                            className="rounded-lg border border-white/10 px-3 py-2 flex items-center justify-between gap-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate font-medium">
                                                    {it.ingredient_name ?? "-"}
                                                    {it.flags.big_amount ? (
                                                        <span className="ml-2 text-xs text-red-500">⚠</span>
                                                    ) : null}
                                                </div>

                                                {delta != null ? (
                                                    <div className="text-xs">
                                                        <span className="text-[var(--text-muted)]">เปลี่ยน</span>{" "}
                                                        <span className="font-semibold">{changeText}</span>
                                                    </div>
                                                ) : null}

                                                <div className="text-xs text-[var(--text-muted)]">
                                                    ก่อน {it.before_stock ?? "-"} → หลัง {it.after_stock ?? "-"}
                                                </div>
                                            </div>

                                            <div className="font-semibold whitespace-nowrap">
                                                {changeText}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : null}
        </div>
    );
}
