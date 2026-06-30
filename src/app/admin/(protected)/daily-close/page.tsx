"use client";

import { useEffect, useMemo, useState } from "react";

import Card from "@/components/admin/Card";
import { Button } from "@/components/ui/button";

type DataQualityWarning = {
    code: string;
    message: string;
    count?: number;
};

type PaidTransaction = {
    id: string;
    occurredAt: string;
    timestampSource: "paid_at" | "created_at";
    paymentMethod: string | null;
    total: number;
    paidAmount: number | null;
    changeAmount: number | null;
};

type CancelledTransaction = {
    id: string;
    cancelledAt: string | null;
    originalTotal: number;
    reason: string | null;
    note: string | null;
    cancelledBy: string | null;
    stockRefunded: boolean;
    stockRefundedAt: string | null;
};

type DailyCloseReport = {
    date: string;
    boundaries: { start: string; end: string; timeZone: string };
    context: {
        shopId: string;
        shopName: string | null;
        branchId: string;
        branchName: string | null;
    };
    generatedAt: string;
    summary: {
        paidTotal: number;
        paidOrderCount: number;
        averageOrderValue: number;
    };
    payments: {
        cash: { sales: number; orderCount: number };
        promptPay: { sales: number; orderCount: number };
        unknown: { sales: number; orderCount: number };
        reconciled: boolean;
    };
    cash: {
        sales: number;
        tendered: number;
        change: number;
        retained: number;
        dataMissingCount: number;
    };
    cashMovements: {
        cashInTotal: number;
        cashOutTotal: number;
        cashMovementNet: number;
        movements: Array<{
            id: string;
            type: "cash_in" | "cash_out";
            reason: string;
            amount: number;
            note: string | null;
            created_at: string;
        }>;
    };
    cancellations: { count: number; originalValue: number };
    paidTransactions: PaidTransaction[];
    cancelledTransactions: CancelledTransaction[];
    dataQuality: DataQualityWarning[];
};

type DailyClose = {
    id: string;
    shop_id: string;
    branch_id: string;
    business_date: string;
    opening_cash_float: number;
    counted_cash: number | null;
    expected_cash: number;
    cash_difference: number | null;
    gross_sales: number;
    net_sales: number;
    cash_sales: number;
    promptpay_sales: number;
    unknown_payment_sales: number;
    paid_order_count: number;
    cancelled_order_count: number;
    refunded_order_count: number;
    void_order_count: number;
    status: "draft" | "closed" | "approved";
    closed_by: string | null;
    closed_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type DailyCloseRecord = {
    business_date: string;
    status: "draft" | "closed" | "approved";
    gross_sales: number;
    paid_order_count: number;
    expected_cash: number;
    counted_cash: number | null;
    cash_difference: number | null;
    closed_at: string | null;
};

function bangkokDateKey() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function formatMoney(value: number) {
    return new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
}

function formatBangkokTime(value: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(date);
}

function formatBangkokDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "medium",
    }).format(date);
}

function shortId(id: string) {
    return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function paymentLabel(method: string | null) {
    const value = (method ?? "").toLowerCase();
    if (value === "cash") return "เงินสด";
    if (value === "promptpay") return "PromptPay";
    return method || "ไม่ทราบ";
}

function MetricCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail?: string;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-text-secondary opacity-70">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{value}</div>
            {detail ? <div className="mt-1 text-xs text-text-secondary">{detail}</div> : null}
        </div>
    );
}

export default function DailyClosePage() {
    const [date, setDate] = useState(() => bangkokDateKey());
    const [reloadKey, setReloadKey] = useState(0);
    const [report, setReport] = useState<DailyCloseReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [close, setClose] = useState<DailyClose | null>(null);
    const [closeLoading, setCloseLoading] = useState(false);
    const [closeError, setCloseError] = useState<string | null>(null);
    const [openingCashFloat, setOpeningCashFloat] = useState<number | string>("");
    const [countedCash, setCountedCash] = useState<number | string>("");
    const [notes, setNotes] = useState("");
    const [history, setHistory] = useState<DailyCloseRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const [cmType, setCmType] = useState<"cash_in" | "cash_out">("cash_in");
    const [cmReason, setCmReason] = useState("เติมเงินทอน");
    const [cmAmount, setCmAmount] = useState<number | string>("");
    const [cmNote, setCmNote] = useState("");
    const [cmLoading, setCmLoading] = useState(false);
    const [cmError, setCmError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function loadReport() {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/reports/daily-close?date=${encodeURIComponent(date)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const data: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                    const message =
                        data && typeof data === "object" && "error" in data && typeof data.error === "string"
                            ? data.error
                            : "โหลดรายงานปิดยอดรายวันไม่สำเร็จ";
                    throw new Error(message);
                }

                if (!controller.signal.aborted) setReport(data as DailyCloseReport);
            } catch (loadError: unknown) {
                if (controller.signal.aborted) return;
                setReport(null);
                setError(loadError instanceof Error ? loadError.message : "โหลดรายงานไม่สำเร็จ");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        void loadReport();
        return () => controller.abort();
    }, [date, reloadKey]);

    useEffect(() => {
        const controller = new AbortController();

        async function loadClose() {
            setCloseLoading(true);
            setCloseError(null);

            try {
                const response = await fetch(`/api/daily-close?date=${encodeURIComponent(date)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const data: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                    const message =
                        data && typeof data === "object" && "error" in data && typeof data.error === "string"
                            ? data.error
                            : "โหลดข้อมูลการปิดยอดไม่สำเร็จ";
                    throw new Error(message);
                }

                if (!controller.signal.aborted) {
                    const parsed = data as { close?: DailyClose };
                    setClose(parsed.close ?? null);
                }
            } catch (loadError: unknown) {
                if (controller.signal.aborted) return;
                setClose(null);
                setCloseError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลการปิดยอดไม่สำเร็จ");
            } finally {
                if (!controller.signal.aborted) setCloseLoading(false);
            }
        }

        void loadClose();
        return () => controller.abort();
    }, [date, reloadKey]);

    useEffect(() => {
        let alive = true;

        async function loadHistory() {
            setHistoryLoading(true);
            setHistoryError(null);

            try {
                const response = await fetch("/api/daily-close?history=1&limit=14", {
                    cache: "no-store",
                });
                const data: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                    const message =
                        data && typeof data === "object" && "error" in data && typeof data.error === "string"
                            ? data.error
                            : "โหลดประวัติการปิดยอดไม่สำเร็จ";
                    throw new Error(message);
                }

                if (!alive) return;
                const parsed = data as { history?: DailyCloseRecord[] };
                setHistory(parsed.history ?? []);
            } catch (loadError: unknown) {
                if (!alive) return;
                setHistory([]);
                setHistoryError(loadError instanceof Error ? loadError.message : "โหลดประวัติไม่สำเร็จ");
            } finally {
                if (alive) setHistoryLoading(false);
            }
        }

        void loadHistory();
        return () => {
            alive = false;
        };
    }, [reloadKey]);

    const isEmpty = useMemo(
        () =>
            Boolean(report) &&
            report!.paidTransactions.length === 0 &&
            report!.cancelledTransactions.length === 0,
        [report]
    );

    const handleCreateDraft = async () => {
        setCloseLoading(true);
        setCloseError(null);

        try {
            const res = await fetch("/api/daily-close", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_date: date,
                    opening_cash_float: Number(openingCashFloat) || 0,
                }),
            });
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(
                    data && typeof data === "object" && "error" in data && typeof data.error === "string"
                        ? data.error
                        : "สร้าง Draft ไม่สำเร็จ"
                );
            }

            setClose(data as DailyClose);
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCloseError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setCloseLoading(false);
        }
    };

    const handleClose = async () => {
        setCloseLoading(true);
        setCloseError(null);

        try {
            const res = await fetch("/api/daily-close", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_date: date,
                    counted_cash: Number(countedCash),
                    notes: notes.trim() || null,
                }),
            });
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(
                    data && typeof data === "object" && "error" in data && typeof data.error === "string"
                        ? data.error
                        : "ปิดยอดไม่สำเร็จ"
                );
            }

            setClose(data as DailyClose);
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCloseError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setCloseLoading(false);
        }
    };

    const expectedDrawerCashDisplay = close
        ? close.expected_cash
        : (report?.cash.retained || 0) + (report?.cashMovements.cashMovementNet || 0);

    const handleAddCashMovement = async () => {
        setCmLoading(true);
        setCmError(null);

        try {
            const res = await fetch("/api/cash-movements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_date: date,
                    type: cmType,
                    reason: cmReason,
                    amount: Number(cmAmount),
                    note: cmNote.trim() || null,
                }),
            });

            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                const message =
                    data && typeof data === "object" && "error" in data && typeof data.error === "string"
                        ? data.error
                        : "บันทึกรายการเงินสดไม่สำเร็จ";
                throw new Error(message);
            }

            setCmAmount("");
            setCmNote("");
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCmError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setCmLoading(false);
        }
    };

    const isCloseFinalized = close?.status === "closed" || close?.status === "approved";

    return (
        <div className="p-6 text-text-primary">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">ปิดยอดรายวัน</h1>
                        <p className="mt-1 text-sm text-text-secondary">Daily Close / End of Day Report</p>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-text-secondary">
                            วันที่ (Asia/Bangkok)
                            <input
                                type="date"
                                value={date}
                                onChange={(event) => setDate(event.target.value)}
                                className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none focus:border-white/25"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => setReloadKey((value) => value + 1)}
                            disabled={loading}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            รีเฟรช
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                    Live report — ยังไม่ใช่การปิดกะหรือการล็อกยอด รายงานอาจเปลี่ยนได้หากสถานะออเดอร์เปลี่ยนภายหลัง
                </div>

                {error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
                        {error}
                    </div>
                ) : null}

                <Card title="สถานะปิดยอดวันนี้">
                    <div className="space-y-4">
                        {closeLoading ? (
                            <div className="text-sm text-text-secondary">กำลังโหลด...</div>
                        ) : closeError ? (
                            <div className="text-sm text-red-400">{closeError}</div>
                        ) : null}

                        {!close ? (
                            <>
                                <div className="text-sm">
                                    สถานะ: <span className="font-semibold text-text-secondary">ยังไม่ได้เริ่มปิดยอด</span>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-text-secondary block mb-1">
                                            เงินสดตั้งต้น
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={openingCashFloat}
                                            onChange={(e) => setOpeningCashFloat(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none focus:border-white/25"
                                            disabled={closeLoading}
                                        />
                                    </div>
                                    <Button onClick={handleCreateDraft} disabled={closeLoading || loading}>
                                        {closeLoading ? "กำลังสร้าง..." : "สร้าง Draft ปิดยอด"}
                                    </Button>
                                </div>
                            </>
                        ) : close.status === "draft" ? (
                            <>
                                <div className="text-sm">
                                    สถานะ: <span className="font-semibold text-amber-300">Draft</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <MetricCard label="เงินสดตั้งต้น" value={formatMoney(close.opening_cash_float)} />
                                    <MetricCard label="เงินสดที่ควรนับได้" value={formatMoney(expectedDrawerCashDisplay)} />
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-text-secondary block mb-1">
                                            เงินสดที่นับได้จริง
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={countedCash}
                                            onChange={(e) => setCountedCash(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none focus:border-white/25"
                                            disabled={closeLoading}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-secondary block mb-1">
                                            หมายเหตุ (ไม่บังคับ)
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="เช่น สรุปการขาด/เกินของวันนี้"
                                            className="w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary outline-none focus:border-white/25"
                                            rows={2}
                                            disabled={closeLoading}
                                        />
                                    </div>
                                    <Button onClick={handleClose} disabled={closeLoading || loading}>
                                        {closeLoading ? "กำลังปิดยอด..." : "ปิดยอดวันนี้"}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-sm">
                                    สถานะ: <span className="font-semibold text-green-400">ปิดยอดแล้ว</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <MetricCard label="เงินสดตั้งต้น" value={formatMoney(close.opening_cash_float)} />
                                    <MetricCard label="เงินสดที่นับได้จริง" value={close.counted_cash != null ? formatMoney(close.counted_cash) : "-"} />
                                    <MetricCard label="เงินสดที่ควรนับได้" value={formatMoney(expectedDrawerCashDisplay)} />
                                    <MetricCard
                                        label="ส่วนต่าง"
                                        value={
                                            close.cash_difference != null
                                                ? formatMoney(close.cash_difference)
                                                : "-"
                                        }
                                    />
                                </div>
                                {close.closed_at ? (
                                    <div className="text-xs text-text-secondary">
                                        เวลาที่ปิดยอด: {formatBangkokDateTime(close.closed_at)}
                                    </div>
                                ) : null}
                                {close.notes ? (
                                    <div className="text-xs text-text-secondary mt-2">หมายเหตุ: {close.notes}</div>
                                ) : null}
                            </>
                        )}
                    </div>
                </Card>

                {loading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="h-28 animate-pulse rounded-xl bg-white/5" />
                        ))}
                    </div>
                ) : report ? (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
                            <span>
                                {report.context.shopName ?? "Coffee SaaS"} • {report.context.branchName ?? report.context.branchId}
                            </span>
                            <span>สร้างเมื่อ {formatBangkokDateTime(report.generatedAt)}</span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <MetricCard label="ยอดขายที่ชำระแล้ว" value={formatMoney(report.summary.paidTotal)} />
                            <MetricCard label="ออเดอร์ชำระแล้ว" value={`${report.summary.paidOrderCount} รายการ`} />
                            <MetricCard label="บิลเฉลี่ย (AOV)" value={formatMoney(report.summary.averageOrderValue)} />
                            <MetricCard
                                label="ยอดขายเงินสด"
                                value={formatMoney(report.payments.cash.sales)}
                                detail={`${report.payments.cash.orderCount} รายการ`}
                            />
                            <MetricCard
                                label="ยอดขาย PromptPay"
                                value={formatMoney(report.payments.promptPay.sales)}
                                detail={`${report.payments.promptPay.orderCount} รายการ`}
                            />
                            <MetricCard
                                label="ยกเลิก / ปัญหา"
                                value={`${report.cancellations.count} รายการ`}
                                detail={`มูลค่าเดิม ${formatMoney(report.cancellations.originalValue)}`}
                            />
                        </div>

                        {report.payments.unknown.orderCount > 0 ? (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                                วิธีชำระไม่ทราบ: {report.payments.unknown.orderCount} รายการ • {formatMoney(report.payments.unknown.sales)}
                            </div>
                        ) : null}

                        <Card title="สรุปเงินสด">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                                <MetricCard label="ยอดขายเงินสด" value={formatMoney(report.cash.sales)} />
                                <MetricCard label="รับเงิน" value={formatMoney(report.cash.tendered)} />
                                <MetricCard label="เงินทอน" value={formatMoney(report.cash.change)} />
                                <MetricCard label="เงินสดคงเหลือจากรายการ" value={formatMoney(report.cash.retained)} />
                                <MetricCard
                                    label="เงินสดที่ควรมีทั้งหมด"
                                    value={formatMoney(expectedDrawerCashDisplay)}
                                />
                                <MetricCard label="ข้อมูลเงินสดไม่ครบ" value={`${report.cash.dataMissingCount} รายการ`} />
                            </div>
                            {report.cash.dataMissingCount > 0 ? (
                                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                    ยอดรับ เงินทอน และเงินสดคงเหลือเป็นผลรวมจากรายการที่มีข้อมูลเท่านั้น
                                </div>
                            ) : null}
                        </Card>

                        <Card title="รายการเงินสดเข้า/ออก">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
                                <MetricCard label="เงินสดเข้า" value={formatMoney(report.cashMovements.cashInTotal)} />
                                <MetricCard label="เงินสดออก" value={formatMoney(report.cashMovements.cashOutTotal)} />
                                <MetricCard label="สุทธิ" value={formatMoney(report.cashMovements.cashMovementNet)} />
                            </div>

                            {!isCloseFinalized ? (
                                <form
                                    className="space-y-3 border-t border-white/10 pt-4"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void handleAddCashMovement();
                                    }}
                                >
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                        <div>
                                            <label className="text-xs text-text-secondary block mb-1">ประเภท</label>
                                            <select
                                                value={cmType}
                                                onChange={(e) => setCmType(e.target.value as "cash_in" | "cash_out")}
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40"
                                            >
                                                <option className="dark:bg-surface dark:text-text-primary" value="cash_in">เงินสดเข้า</option>
                                                <option className="dark:bg-surface dark:text-text-primary" value="cash_out">เงินสดออก</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-text-secondary block mb-1">เหตุผล</label>
                                            <select
                                                value={cmReason}
                                                onChange={(e) => setCmReason(e.target.value)}
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40"
                                            >
                                                <option className="dark:bg-surface dark:text-text-primary" value="เติมเงินทอน">เติมเงินทอน</option>
                                                <option className="dark:bg-surface dark:text-text-primary" value="ซื้อของเข้าร้าน">ซื้อของเข้าร้าน</option>
                                                <option className="dark:bg-surface dark:text-text-primary" value="เบิกเงินสด">เบิกเงินสด</option>
                                                <option className="dark:bg-surface dark:text-text-primary" value="ฝากธนาคาร">ฝากธนาคาร</option>
                                                <option className="dark:bg-surface dark:text-text-primary" value="ปรับยอดเงินสด">ปรับยอดเงินสด</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-text-secondary block mb-1">จำนวนเงิน</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                value={cmAmount}
                                                onChange={(e) => setCmAmount(e.target.value)}
                                                placeholder="0.00"
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40 placeholder:text-text-muted"
                                                disabled={cmLoading}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-text-secondary block mb-1">หมายเหตุ (ไม่บังคับ)</label>
                                            <input
                                                type="text"
                                                value={cmNote}
                                                onChange={(e) => setCmNote(e.target.value)}
                                                placeholder="เช่น เติมจากธนาคาร"
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40 placeholder:text-text-muted"
                                                disabled={cmLoading}
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button
                                                type="submit"
                                                disabled={cmLoading || !cmAmount || Number(cmAmount) <= 0}
                                                className="w-full"
                                            >
                                                {cmLoading ? "กำลังบันทึก..." : "บันทึกรายการ"}
                                            </Button>
                                        </div>
                                    </div>
                                    {cmError ? (
                                        <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                                            {cmError}
                                        </div>
                                    ) : null}
                                </form>
                            ) : (
                                <div className="border-t border-white/10 pt-3 text-xs text-text-secondary">
                                    ปิดยอดแล้ว / อนุมัติแล้ว — ไม่สามารถเพิ่มรายการเงินสดได้
                                </div>
                            )}

                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[600px] text-sm">
                                    <thead className="text-left text-xs text-text-secondary">
                                        <tr className="border-b border-white/10">
                                            <th className="px-3 py-2">เวลา</th>
                                            <th className="px-3 py-2">ประเภท</th>
                                            <th className="px-3 py-2">เหตุผล</th>
                                            <th className="px-3 py-2 text-right">จำนวน</th>
                                            <th className="px-3 py-2">หมายเหตุ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.cashMovements.movements.length ? (
                                            report.cashMovements.movements.map((movement) => (
                                                <tr key={movement.id} className="border-b border-white/5">
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        {formatBangkokTime(movement.created_at)}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {movement.type === "cash_in" ? "เงินสดเข้า" : "เงินสดออก"}
                                                    </td>
                                                    <td className="px-3 py-3">{movement.reason}</td>
                                                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                                                        {formatMoney(movement.amount)}
                                                    </td>
                                                    <td className="px-3 py-3 text-text-secondary">
                                                        {movement.note ?? "-"}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-6 text-center text-text-secondary">
                                                    ยังไม่มีรายการเงินสดเข้า/ออก
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        {report.dataQuality.length > 0 ? (
                            <Card title="คำเตือนคุณภาพข้อมูล">
                                <div className="space-y-2">
                                    {report.dataQuality.map((warning) => (
                                        <div
                                            key={warning.code}
                                            className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                                        >
                                            {warning.message}
                                            {typeof warning.count === "number" ? ` (${warning.count})` : ""}
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ) : null}

                        {isEmpty ? (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-text-secondary">
                                ไม่มีออเดอร์ที่ชำระแล้วหรือยกเลิกในวันที่เลือก
                            </div>
                        ) : null}

                        <Card title={`รายการชำระแล้ว (${report.paidTransactions.length})`}>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead className="text-left text-xs text-text-secondary">
                                        <tr className="border-b border-white/10">
                                            <th className="px-3 py-2">เวลา</th>
                                            <th className="px-3 py-2">Order</th>
                                            <th className="px-3 py-2">วิธีจ่าย</th>
                                            <th className="px-3 py-2 text-right">ยอดรวม</th>
                                            <th className="px-3 py-2 text-right">รับ / ทอน</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.paidTransactions.length ? (
                                            report.paidTransactions.map((transaction) => {
                                                const isCash = transaction.paymentMethod?.toLowerCase() === "cash";
                                                return (
                                                    <tr key={transaction.id} className="border-b border-white/5">
                                                        <td className="px-3 py-3 whitespace-nowrap">
                                                            {formatBangkokTime(transaction.occurredAt)}
                                                            {transaction.timestampSource === "created_at" ? (
                                                                <span className="ml-1 text-amber-300" title="ใช้ created_at เพราะไม่มี paid_at">
                                                                    *
                                                                </span>
                                                            ) : null}
                                                        </td>
                                                        <td className="px-3 py-3 font-mono" title={transaction.id}>
                                                            {shortId(transaction.id)}
                                                        </td>
                                                        <td className="px-3 py-3">{paymentLabel(transaction.paymentMethod)}</td>
                                                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                                                            {formatMoney(transaction.total)}
                                                        </td>
                                                        <td className="px-3 py-3 text-right tabular-nums text-text-secondary">
                                                            {isCash
                                                                ? `รับ ${transaction.paidAmount == null ? "-" : formatMoney(transaction.paidAmount)} • ทอน ${transaction.changeAmount == null ? "-" : formatMoney(transaction.changeAmount)}`
                                                                : "-"}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-6 text-center text-text-secondary">
                                                    ไม่มีรายการชำระแล้ว
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <Card title={`รายการยกเลิก (${report.cancelledTransactions.length})`}>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] text-sm">
                                    <thead className="text-left text-xs text-text-secondary">
                                        <tr className="border-b border-white/10">
                                            <th className="px-3 py-2">เวลายกเลิก</th>
                                            <th className="px-3 py-2">Order</th>
                                            <th className="px-3 py-2 text-right">มูลค่าเดิม</th>
                                            <th className="px-3 py-2">เหตุผล</th>
                                            <th className="px-3 py-2">หมายเหตุ</th>
                                            <th className="px-3 py-2">สต็อก</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.cancelledTransactions.length ? (
                                            report.cancelledTransactions.map((transaction) => (
                                                <tr key={transaction.id} className="border-b border-white/5">
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        {formatBangkokTime(transaction.cancelledAt)}
                                                    </td>
                                                    <td className="px-3 py-3 font-mono" title={transaction.id}>
                                                        {shortId(transaction.id)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                                                        {formatMoney(transaction.originalTotal)}
                                                    </td>
                                                    <td className="px-3 py-3">{transaction.reason ?? "-"}</td>
                                                    <td className="px-3 py-3">{transaction.note ?? "-"}</td>
                                                    <td className="px-3 py-3">
                                                        {transaction.stockRefunded ? "คืนสต็อกแล้ว" : "ไม่คืนสต็อก"}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-6 text-center text-text-secondary">
                                                    ไม่มีรายการยกเลิกในวันที่เลือก
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        {historyLoading ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="h-16 animate-pulse rounded-xl bg-white/5" />
                                ))}
                            </div>
                        ) : historyError ? (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                                {historyError}
                            </div>
                        ) : (
                            <Card title="ประวัติการปิดยอด">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[900px] text-sm">
                                        <thead className="text-left text-xs text-text-secondary">
                                            <tr className="border-b border-white/10">
                                                <th className="px-3 py-2">วันที่</th>
                                                <th className="px-3 py-2">สถานะ</th>
                                                <th className="px-3 py-2 text-right">ยอดขายรวม</th>
                                                <th className="px-3 py-2 text-right">จำนวนออเดอร์</th>
                                                <th className="px-3 py-2 text-right">เงินสดที่ควรนับได้</th>
                                                <th className="px-3 py-2 text-right">เงินสดที่นับได้จริง</th>
                                                <th className="px-3 py-2 text-right">ส่วนต่าง</th>
                                                <th className="px-3 py-2">เวลาปิดยอด</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-3 py-6 text-center text-text-secondary">
                                                        ยังไม่มีประวัติการปิดยอด
                                                    </td>
                                                </tr>
                                            ) : (
                                                history.map((row) => {
                                                    const isSelected = date === row.business_date;
                                                    const isToday = row.business_date === bangkokDateKey();
                                                    return (
                                                        <tr
                                                            key={row.business_date}
                                                            onClick={() => setDate(row.business_date)}
                                                            className={`border-b border-white/5 transition-colors cursor-pointer ${
                                                                isSelected ? "bg-white/15 hover:bg-white/15" : "hover:bg-white/5"
                                                            }`}
                                                        >
                                                            <td className="px-3 py-3 whitespace-nowrap font-medium">
                                                                {row.business_date}
                                                                {isSelected && isToday ? " (ปัจจุบัน)" : null}
                                                                {isSelected && !isToday ? " (กำลังดู)" : null}
                                                                {!isSelected && isToday ? " (วันนี้)" : null}
                                                            </td>
                                                            <td className="px-3 py-3">
                                                                {row.status === "draft" ? (
                                                                    <span className="text-amber-300">Draft</span>
                                                                ) : row.status === "closed" ? (
                                                                    <span className="text-green-300">Closed</span>
                                                                ) : row.status === "approved" ? (
                                                                    <span className="text-emerald-300">Approved</span>
                                                                ) : (
                                                                    row.status
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-3 text-right tabular-nums">
                                                                {formatMoney(row.gross_sales)}
                                                            </td>
                                                            <td className="px-3 py-3 text-right tabular-nums">
                                                                {row.paid_order_count}
                                                            </td>
                                                            <td className="px-3 py-3 text-right tabular-nums">
                                                                {formatMoney(row.expected_cash)}
                                                            </td>
                                                            <td className="px-3 py-3 text-right tabular-nums">
                                                                {row.counted_cash != null ? formatMoney(row.counted_cash) : "-"}
                                                            </td>
                                                            <td className="px-3 py-3 text-right tabular-nums">
                                                                {row.cash_difference != null ? formatMoney(row.cash_difference) : "-"}
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-text-secondary">
                                                                {row.closed_at ? formatBangkokTime(row.closed_at) : "-"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}
