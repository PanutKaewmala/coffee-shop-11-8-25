"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Card from "@/components/admin/Card";
import { Button } from "@/components/ui/button";
import { computeExpectedCash } from "@/lib/dailyCloseMoney";
import {
    cashMovementNavigationIntent,
    cashMovementReasonsFor,
    firstCashMovementReason,
    findCashMovementReason,
} from "@/lib/cashMovementPolicy.mjs";

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

type DailyClosePermissions = {
    canFinalize: boolean;
};

type DailyCloseResponse = {
    close?: DailyClose;
    role?: string;
    permissions?: DailyClosePermissions;
    history?: DailyCloseRecord[];
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
    if (value === "promptpay") return "พร้อมเพย์";
    return method || "ไม่ทราบ";
}

function closeStatusLabel(status: "draft" | "closed" | "approved" | null | undefined) {
    if (status === "draft") return "ยังไม่ปิดยอด";
    if (status === "closed") return "ปิดยอดแล้ว";
    if (status === "approved") return "อนุมัติแล้ว";
    return "ยังไม่ปิดยอด";
}

function ownerFacingError(message: string) {
    switch (message) {
        case "Invalid date. Use YYYY-MM-DD.":
        case "Invalid business_date. Use YYYY-MM-DD.":
            return "วันที่ขายไม่ถูกต้อง";
        case "Unauthorized":
            return "กรุณาเข้าสู่ระบบอีกครั้ง";
        case "No current shop selected":
            return "ยังไม่ได้เลือกร้าน";
        case "No current branch selected":
            return "ยังไม่ได้เลือกสาขา";
        case "Not a member of current shop":
            return "บัญชีนี้ไม่ได้อยู่ในร้านที่เลือก";
        case "Only owners can close daily close":
            return "เฉพาะเจ้าของร้านเท่านั้นที่ปิดยอดได้";
        case "Daily close already exists for this branch and date. Fetch it instead.":
            return "วันที่ขายนี้มีรายการปิดยอดอยู่แล้ว";
        case "Daily close not found":
            return "ยังไม่มีรายการปิดยอดของวันที่ขายนี้";
        case "Can only close a draft daily close":
            return "ปิดยอดได้เฉพาะรายการที่ยังไม่ปิดยอด";
        case "Invalid JSON body":
            return "ข้อมูลที่ส่งไม่ถูกต้อง";
        case "Invalid type. Use cash_in or cash_out.":
            return "ประเภทเงินสดเข้า/ออกไม่ถูกต้อง";
        case "Invalid reason.":
        case "Invalid reason for cash movement type.":
            return "กรุณาเลือกเหตุผลให้ตรงกับประเภทเงินเข้า/เงินออก";
        case "Owner role required for this cash movement reason.":
            return "เหตุผลนี้ใช้ได้เฉพาะเจ้าของร้าน";
        case "Note is required for this cash movement reason.":
            return "กรุณากรอกหมายเหตุสำหรับเหตุผลนี้";
        case "Invalid amount. Must be a positive number.":
            return "จำนวนเงินต้องมากกว่า 0";
        case "Failed to load daily close report":
            return "โหลดข้อมูลปิดยอดวันไม่สำเร็จ";
        case "Failed to load daily close":
            return "โหลดข้อมูลปิดยอดไม่สำเร็จ";
        case "Failed to create daily close":
            return "เริ่มปิดยอดไม่สำเร็จ";
        case "Failed to close daily close":
            return "ปิดยอดไม่สำเร็จ";
        case "Failed to prepare daily close":
            return "บันทึกยอดนับไม่สำเร็จ";
        case "counted_cash is required":
            return "กรุณากรอกเงินสดที่นับได้จริง";
        case "counted_cash must be a number":
            return "เงินสดที่นับได้จริงต้องเป็นตัวเลข";
        case "counted_cash must be a finite number":
            return "เงินสดที่นับได้จริงต้องเป็นตัวเลขที่ถูกต้อง";
        case "counted_cash cannot be negative":
            return "เงินสดที่นับได้จริงต้องไม่ติดลบ";
        case "Branch does not belong to the current shop":
            return "สาขาไม่ได้อยู่ในร้านที่เลือก";
        case "Can only prepare a draft daily close":
            return "บันทึกยอดนับได้เฉพาะรายการที่ยังไม่ปิดยอด";
        case "Failed to create cash movement":
        case "server_error":
            return "บันทึกรายการเงินสดไม่สำเร็จ";
        default:
            return message;
    }
}

function responseErrorMessage(data: unknown, fallback: string) {
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
        return ownerFacingError(data.error);
    }
    return fallback;
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
    const router = useRouter();
    const [date, setDate] = useState(() => bangkokDateKey());
    const [reloadKey, setReloadKey] = useState(0);
    const [report, setReport] = useState<DailyCloseReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [close, setClose] = useState<DailyClose | null>(null);
    const [closeLoading, setCloseLoading] = useState(false);
    const [closeError, setCloseError] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<DailyClosePermissions | null>(null);
    const [role, setRole] = useState<"owner" | "staff">("staff");
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
                    const message = responseErrorMessage(data, "โหลดข้อมูลปิดยอดวันไม่สำเร็จ");
                    throw new Error(message);
                }

                if (!controller.signal.aborted) setReport(data as DailyCloseReport);
            } catch (loadError: unknown) {
                if (controller.signal.aborted) return;
                setReport(null);
                setError(loadError instanceof Error ? ownerFacingError(loadError.message) : "โหลดข้อมูลไม่สำเร็จ");
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
                    const message = responseErrorMessage(data, "โหลดข้อมูลปิดยอดไม่สำเร็จ");
                    throw new Error(message);
                }

                if (!controller.signal.aborted) {
                    const parsed = data as DailyCloseResponse;
                    const loaded = parsed.close ?? null;
                    setClose(loaded);
                    setPermissions(parsed.permissions ?? null);
                    if (parsed.role === "owner" || parsed.role === "staff") setRole(parsed.role);
                    if (loaded) {
                        setCountedCash(loaded.counted_cash != null ? String(loaded.counted_cash) : "");
                        setNotes(loaded.notes ?? "");
                    }
                }
            } catch (loadError: unknown) {
                if (controller.signal.aborted) return;
                setClose(null);
                setCloseError(loadError instanceof Error ? ownerFacingError(loadError.message) : "โหลดข้อมูลปิดยอดไม่สำเร็จ");
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
                    const message = responseErrorMessage(data, "โหลดประวัติปิดยอดไม่สำเร็จ");
                    throw new Error(message);
                }

                if (!alive) return;
                const parsed = data as DailyCloseResponse;
                setHistory(parsed.history ?? []);
                if (parsed.permissions) setPermissions(parsed.permissions);
                if (parsed.role === "owner" || parsed.role === "staff") setRole(parsed.role);
            } catch (loadError: unknown) {
                if (!alive) return;
                setHistory([]);
                setHistoryError(loadError instanceof Error ? ownerFacingError(loadError.message) : "โหลดประวัติไม่สำเร็จ");
            } finally {
                if (alive) setHistoryLoading(false);
            }
        }

        void loadHistory();
        return () => {
            alive = false;
        };
    }, [reloadKey]);

    const cmReasonOptions = useMemo(() => cashMovementReasonsFor(cmType, role), [cmType, role]);
    const selectedCmReasonPolicy = useMemo(() => findCashMovementReason(cmType, cmReason), [cmType, cmReason]);
    const isCmNoteRequired = Boolean(selectedCmReasonPolicy?.requiresNote);

    useEffect(() => {
        const first = firstCashMovementReason(cmType, role);
        if (!first) return;
        if (!cmReasonOptions.some((reason) => reason.value === cmReason)) {
            setCmReason(first.value);
            setCmNote("");
        }
    }, [cmType, role, cmReason, cmReasonOptions]);

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
                    responseErrorMessage(data, "เริ่มปิดยอดไม่สำเร็จ")
                );
            }

            const parsed = data as DailyCloseResponse;
            setClose(parsed.close ?? null);
            if (parsed.permissions) setPermissions(parsed.permissions);
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCloseError(err instanceof Error ? ownerFacingError(err.message) : "เกิดข้อผิดพลาด");
        } finally {
            setCloseLoading(false);
        }
    };

    const prepareCountedCashPayload = (): { counted_cash?: number; notes: string | null } | null => {
        const cleanedNotes = notes.trim() || null;
        const raw = String(countedCash).trim();
        if (raw === "") {
            return { notes: cleanedNotes };
        }
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0) {
            return null;
        }
        return { counted_cash: num, notes: cleanedNotes };
    };

    const handleClose = async () => {
        setCloseLoading(true);
        setCloseError(null);

        try {
            const trimmed = prepareCountedCashPayload();
            if (!trimmed) {
                throw new Error("กรุณากรอกเงินสดที่นับได้จริงให้ถูกต้อง");
            }
            if (trimmed.counted_cash === undefined) {
                throw new Error("กรุณากรอกเงินสดที่นับได้จริง");
            }

            const res = await fetch("/api/daily-close", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_date: date,
                    counted_cash: trimmed.counted_cash,
                    notes: trimmed.notes,
                }),
            });
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(
                    responseErrorMessage(data, "ปิดยอดไม่สำเร็จ")
                );
            }

            const parsed = data as DailyCloseResponse;
            setClose(parsed.close ?? null);
            if (parsed.permissions) setPermissions(parsed.permissions);
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCloseError(err instanceof Error ? ownerFacingError(err.message) : "เกิดข้อผิดพลาด");
        } finally {
            setCloseLoading(false);
        }
    };

    const handlePrepareDraft = async () => {
        setCloseLoading(true);
        setCloseError(null);

        try {
            const trimmed = prepareCountedCashPayload();
            if (!trimmed) {
                throw new Error("กรุณากรอกเงินสดที่นับได้จริงให้ถูกต้อง");
            }

            const res = await fetch("/api/daily-close/prep", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_date: date,
                    ...trimmed,
                }),
            });
            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(
                    responseErrorMessage(data, "บันทึกยอดนับไม่สำเร็จ")
                );
            }

            const parsed = data as DailyCloseResponse;
            setClose(parsed.close ?? null);
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCloseError(err instanceof Error ? ownerFacingError(err.message) : "เกิดข้อผิดพลาด");
        } finally {
            setCloseLoading(false);
        }
    };

    const isCloseFinalized = close?.status === "closed" || close?.status === "approved";

    // Drafts: always show the live, canonical expected cash (report + opening cash).
    // Never show the stale persisted draft expected_cash.
    // Finalized rows: show the stored, server-trusted snapshot (do not recalc from mutable data).
    const expectedDrawerCashDisplay = (() => {
        if (isCloseFinalized && close) {
            return close.expected_cash;
        }
        if (report) {
            return computeExpectedCash({
                openingCash: close?.opening_cash_float ?? 0,
                paidCashSales: report.payments.cash.sales,
                cashIn: report.cashMovements.cashInTotal,
                cashOut: report.cashMovements.cashOutTotal,
            });
        }
        return close?.expected_cash ?? 0;
    })();

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
                const message = responseErrorMessage(data, "บันทึกรายการเงินสดไม่สำเร็จ");
                throw new Error(message);
            }

            const parsed = data as { movement?: { id?: string; type?: string; reason?: string }; navigationIntent?: { href?: string } | null };
            setCmAmount("");
            setCmNote("");
            const href = parsed.navigationIntent?.href ?? cashMovementNavigationIntent(parsed.movement)?.href;
            if (href) {
                router.push(href);
                return;
            }
            setReloadKey((v) => v + 1);
        } catch (err) {
            setCmError(err instanceof Error ? ownerFacingError(err.message) : "เกิดข้อผิดพลาด");
        } finally {
            setCmLoading(false);
        }
    };

    const handlePrint = () => {
        if (loading || !report) return;

        const escapeHtml = (text: string): string =>
            text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

        const safeText = (value: unknown, fallback = "-"): string => {
            if (value === null || value === undefined) return fallback;
            if (typeof value === "number" && Number.isFinite(value)) return formatMoney(value);
            if (typeof value === "string") return escapeHtml(value);
            return fallback;
        };

        const printedAt = new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            dateStyle: "medium",
            timeStyle: "medium",
        }).format(new Date());

        const shopName = escapeHtml(report.context.shopName ?? "ร้านค้า");
        const branchName = escapeHtml(report.context.branchName ?? "สาขา");
        const selectedDate = escapeHtml(date);

        const statusLabel = closeStatusLabel(close?.status);
        let statusBg = "#666";
        if (close) {
            if (close.status === "draft") { statusBg = "#b45309"; }
            else if (close.status === "closed") { statusBg = "#15803d"; }
            else if (close.status === "approved") { statusBg = "#0f766e"; }
        }

        const html = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>รายงานปิดยอดวัน</title>
    <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 12pt;
            color: #000;
            background: #fff;
            line-height: 1.45;
            margin: 0;
            padding: 0;
        }
        h1 { font-size: 18pt; margin: 0 0 10px 0; }
        h2 { font-size: 13pt; margin: 18px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #bbb; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; font-size: 11pt; vertical-align: top; }
        th { background: #f4f4f4; font-weight: 600; }
        .right { text-align: right; }
        .center { text-align: center; }
        .meta { margin: 0 0 12px 0; font-size: 11pt; }
        .meta div { margin: 3px 0; }
        .section { margin-bottom: 14px; page-break-inside: avoid; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; page-break-inside: avoid; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; page-break-inside: avoid; }
        .box { border: 1px solid #ddd; padding: 8px; border-radius: 4px; page-break-inside: avoid; }
        .label { font-size: 10pt; color: #444; }
        .value { font-size: 12pt; font-weight: 600; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11pt; font-weight: 600; color: #fff; background: ${statusBg}; }
        .footer { margin-top: 28px; font-size: 10pt; color: #555; border-top: 1px solid #ddd; padding-top: 8px; }
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <h1>รายงานปิดยอดวัน</h1>
    <div class="meta">
        <div><strong>ร้าน:</strong> ${shopName} • ${branchName}</div>
        <div><strong>วันที่ขาย:</strong> ${selectedDate}</div>
        <div><strong>สถานะ:</strong> <span class="badge">${statusLabel}</span></div>
        ${close?.closed_at ? `<div><strong>เวลาปิดยอด:</strong> ${safeText(formatBangkokDateTime(close.closed_at))}</div>` : ""}
        ${close?.notes ? `<div><strong>หมายเหตุ:</strong> ${safeText(close.notes)}</div>` : ""}
        <div><strong>พิมพ์เมื่อ:</strong> ${printedAt}</div>
    </div>

    <h2>ข้อมูลเงินสด</h2>
        <div class="grid-3" style="margin-bottom:8px;">
            <div class="box"><div class="label">เงินสดตั้งต้น</div><div class="value">${close ? safeText(close.opening_cash_float) : "-"}</div></div>
            <div class="box"><div class="label">ยอดขายเงินสด</div><div class="value">${safeText(report.cash.sales)}</div></div>
            <div class="box"><div class="label">เงินสดรับจากลูกค้า</div><div class="value">${safeText(report.cash.tendered)}</div></div>
        </div>
    <div class="grid-3" style="margin-bottom:8px;">
        <div class="box"><div class="label">เงินทอนให้ลูกค้า</div><div class="value">${safeText(report.cash.change)}</div></div>
        <div class="box"><div class="label">เงินสดจากยอดขายหลังทอน</div><div class="value">${safeText(report.cash.retained)}</div></div>
        <div class="box"><div class="label">รายการเงินสดที่ข้อมูลไม่ครบ</div><div class="value">${report.cash.dataMissingCount} รายการ</div></div>
    </div>

    <h2>ผลลัพธ์ปิดยอด</h2>
    <div class="grid-3" style="margin-bottom:8px;">
        <div class="box"><div class="label">เงินสดที่ควรอยู่ในลิ้นชัก</div><div class="value">${safeText(expectedDrawerCashDisplay)}</div></div>
        <div class="box"><div class="label">เงินสดที่นับได้จริง</div><div class="value">${close?.counted_cash != null ? safeText(close.counted_cash) : "-"}</div></div>
        <div class="box"><div class="label">ส่วนต่าง</div><div class="value">${close?.cash_difference != null ? safeText(close.cash_difference) : "-"}</div></div>
    </div>

    <h2>รายการเงินสดเข้า/ออก</h2>
    <div class="grid-3" style="margin-bottom:8px;">
        <div class="box"><div class="label">เงินเข้า</div><div class="value">${safeText(report.cashMovements.cashInTotal)}</div></div>
        <div class="box"><div class="label">เงินออก</div><div class="value">${safeText(report.cashMovements.cashOutTotal)}</div></div>
        <div class="box"><div class="label">เงินสดสุทธิจากรายการเข้าออก</div><div class="value">${safeText(report.cashMovements.cashMovementNet)}</div></div>
    </div>
    ${report.cashMovements.movements.length ? `
    <table>
        <thead>
            <tr><th>เวลา</th><th>ประเภท</th><th>เหตุผล</th><th class="right">จำนวน</th><th>หมายเหตุ</th></tr>
        </thead>
        <tbody>
            ${report.cashMovements.movements.map((m) => `
                <tr>
                    <td>${safeText(formatBangkokTime(m.created_at))}</td>
                    <td>${m.type === "cash_in" ? "เงินเข้า" : "เงินออก"}</td>
                    <td>${safeText(m.reason)}</td>
                    <td class="right">${safeText(m.amount)}</td>
                    <td>${safeText(m.note)}</td>
                </tr>
            `).join("")}
        </tbody>
    </table>
    ` : "<p style='margin-top:6px;color:#555;'>ยังไม่มีรายการเงินสดเข้า/ออก</p>"}

    <h2>สรุปยอดขาย</h2>
    <div class="grid-2" style="margin-bottom:8px;">
        <div class="box"><div class="label">ยอดขายรวม</div><div class="value">${safeText(report.summary.paidTotal)}</div></div>
        <div class="box"><div class="label">ออเดอร์ที่ชำระแล้ว</div><div class="value">${report.summary.paidOrderCount} รายการ</div></div>
        <div class="box"><div class="label">ยอดเฉลี่ยต่อออเดอร์</div><div class="value">${safeText(report.summary.averageOrderValue)}</div></div>
        <div class="box"><div class="label">ออเดอร์ที่ยกเลิก</div><div class="value">${report.cancellations.count} รายการ</div></div>
    </div>

    <h2>วิธีชำระเงิน</h2>
    <div class="grid-3" style="margin-bottom:8px;">
        <div class="box"><div class="label">เงินสด</div><div class="value">${safeText(report.payments.cash.sales)}</div><div class="label">${report.payments.cash.orderCount} รายการ</div></div>
        <div class="box"><div class="label">พร้อมเพย์</div><div class="value">${safeText(report.payments.promptPay.sales)}</div><div class="label">${report.payments.promptPay.orderCount} รายการ</div></div>
        <div class="box"><div class="label">ไม่พบวิธีชำระเงิน</div><div class="value">${safeText(report.payments.unknown.sales)}</div><div class="label">${report.payments.unknown.orderCount} รายการ</div></div>
    </div>

    ${report.paidTransactions.length ? `
    <h2>ออเดอร์ที่ชำระแล้ว (${report.paidTransactions.length})</h2>
    <table>
        <thead>
            <tr><th>เวลา</th><th>ออเดอร์</th><th>วิธีชำระเงิน</th><th class="right">ยอดขายรวม</th><th class="right">รับเงิน / เงินทอน</th></tr>
        </thead>
        <tbody>
            ${report.paidTransactions.map((t) => `
                <tr>
                    <td>${safeText(formatBangkokTime(t.occurredAt))}${t.timestampSource === "created_at" ? " <span style='color:#b45309;' title='ใช้เวลาสร้างออเดอร์เพราะไม่มีเวลาชำระเงิน'>*</span>" : ""}</td>
                    <td>${safeText(shortId(t.id))}</td>
                    <td>${safeText(paymentLabel(t.paymentMethod))}</td>
                    <td class="right">${safeText(t.total)}</td>
                    <td class="right">${t.paymentMethod?.toLowerCase() === "cash" ? `รับ ${t.paidAmount == null ? "-" : formatMoney(t.paidAmount)} / ทอน ${t.changeAmount == null ? "-" : formatMoney(t.changeAmount)}` : "-"}</td>
                </tr>
            `).join("")}
        </tbody>
    </table>
    ` : ""}

    ${report.cancelledTransactions.length ? `
    <h2>ออเดอร์ที่ยกเลิก (${report.cancelledTransactions.length})</h2>
    <table>
        <thead>
            <tr><th>เวลายกเลิก</th><th>ออเดอร์</th><th class="right">ยอดก่อนยกเลิก</th><th>เหตุผล</th><th>หมายเหตุ</th><th>ผลกระทบต่อสต็อก</th></tr>
        </thead>
        <tbody>
            ${report.cancelledTransactions.map((t) => `
                <tr>
                    <td>${safeText(formatBangkokTime(t.cancelledAt))}</td>
                    <td>${safeText(shortId(t.id))}</td>
                    <td class="right">${safeText(t.originalTotal)}</td>
                    <td>${safeText(t.reason)}</td>
                    <td>${safeText(t.note)}</td>
                    <td>${t.stockRefunded ? "คืนสต็อกแล้ว" : "ไม่ได้คืนสต็อก"}</td>
                </tr>
            `).join("")}
        </tbody>
    </table>
    ` : ""}

    ${report.dataQuality.length ? `
    <h2>ข้อมูลที่ควรตรวจสอบ</h2>
    <ul style="margin:6px 0;padding-left:20px;">
        ${report.dataQuality.map((w) => `<li>${safeText(w.message)}${typeof w.count === "number" ? ` (${w.count})` : ""}</li>`).join("")}
    </ul>
    ` : ""}

    <div class="footer">
        พิมพ์เมื่อ: ${printedAt} • สร้างอัตโนมัติจากระบบปิดยอดวัน
    </div>
</body>
</html>`;

        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.style.opacity = "0";
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 300);
            }, 100);
        }
    };

    return (
        <div className="p-6 text-text-primary">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">ปิดยอดวัน</h1>
                        <p className="mt-1 text-sm text-text-secondary">สรุปยอดขายและเงินสดของวันที่ขาย</p>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-text-secondary">
                            วันที่ขาย
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
                        <button
                            type="button"
                            onClick={() => void handlePrint()}
                            disabled={loading || !report}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            พิมพ์รายงาน
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                    รายงานสด: ยังไม่ใช่การปิดยอดและยังไม่ล็อกยอด หากมีการแก้ไขออเดอร์ ตัวเลขอาจเปลี่ยนได้
                </div>

                {error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
                        {error}
                    </div>
                ) : null}

                <Card title="สถานะปิดยอดของวันที่ขาย">
                    <div className="space-y-4">
                        {closeLoading ? (
                            <div className="text-sm text-text-secondary">กำลังโหลด...</div>
                        ) : closeError ? (
                            <div className="text-sm text-red-400">{closeError}</div>
                        ) : null}

                        {!close ? (
                            <>
                                <div className="text-sm">
                                    สถานะ: <span className="font-semibold text-text-secondary">{closeStatusLabel(null)}</span>
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
                                        {closeLoading ? "กำลังเริ่มวันขาย..." : "เริ่มวันขาย"}
                                    </Button>
                                </div>
                            </>
                        ) : close.status === "draft" ? (
                            <>
                                <div className="text-sm">
                                    สถานะ: <span className="font-semibold text-amber-300">{closeStatusLabel(close.status)}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <MetricCard label="เงินสดตั้งต้น" value={formatMoney(close.opening_cash_float)} />
                                    <MetricCard label="เงินสดที่ควรอยู่ในลิ้นชัก" value={formatMoney(expectedDrawerCashDisplay)} />
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
                                    {permissions?.canFinalize ? (
                                        <Button onClick={handleClose} disabled={closeLoading || loading}>
                                            {closeLoading ? "กำลังปิดยอด..." : "ปิดยอดวันนี้"}
                                        </Button>
                                    ) : (
                                        <>
                                            <Button onClick={handlePrepareDraft} disabled={closeLoading || loading}>
                                                {closeLoading ? "กำลังบันทึก..." : "บันทึกยอดนับ"}
                                            </Button>
                                            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-text-secondary">
                                                รอเจ้าของตรวจและปิดยอด
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-sm">
                                    <span className={`font-semibold ${close.status === "approved" ? "text-emerald-300" : "text-green-400"}`}>
                                        สถานะ: {closeStatusLabel(close.status)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <MetricCard label="เงินสดตั้งต้น" value={formatMoney(close.opening_cash_float)} />
                                    <MetricCard label="เงินสดที่นับได้จริง" value={close.counted_cash != null ? formatMoney(close.counted_cash) : "-"} />
                                    <MetricCard label="เงินสดที่ควรอยู่ในลิ้นชัก" value={formatMoney(expectedDrawerCashDisplay)} />
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
                            <MetricCard label="ยอดขายรวม" value={formatMoney(report.summary.paidTotal)} />
                            <MetricCard label="ออเดอร์ที่ชำระแล้ว" value={`${report.summary.paidOrderCount} รายการ`} />
                            <MetricCard label="ยอดเฉลี่ยต่อออเดอร์" value={formatMoney(report.summary.averageOrderValue)} />
                            <MetricCard
                                label="ยอดขายเงินสด"
                                value={formatMoney(report.payments.cash.sales)}
                                detail={`${report.payments.cash.orderCount} รายการ`}
                            />
                            <MetricCard
                                label="ยอดขายพร้อมเพย์"
                                value={formatMoney(report.payments.promptPay.sales)}
                                detail={`${report.payments.promptPay.orderCount} รายการ`}
                            />
                            <MetricCard
                                label="ออเดอร์ที่ยกเลิก"
                                value={`${report.cancellations.count} รายการ`}
                                detail={`ยอดก่อนยกเลิก ${formatMoney(report.cancellations.originalValue)}`}
                            />
                        </div>

                        {report.payments.unknown.orderCount > 0 ? (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                                ไม่พบวิธีชำระเงิน: {report.payments.unknown.orderCount} รายการ • {formatMoney(report.payments.unknown.sales)}
                            </div>
                        ) : null}

                        <Card title="สรุปเงินสด">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                                <MetricCard label="ยอดขายเงินสด" value={formatMoney(report.cash.sales)} />
                                <MetricCard label="เงินสดรับจากลูกค้า" value={formatMoney(report.cash.tendered)} />
                                <MetricCard label="เงินทอนให้ลูกค้า" value={formatMoney(report.cash.change)} />
                                <MetricCard label="เงินสดจากยอดขายหลังทอน" value={formatMoney(report.cash.retained)} />
                                <MetricCard
                                    label="เงินสดที่ควรอยู่ในลิ้นชัก"
                                    value={formatMoney(expectedDrawerCashDisplay)}
                                />
                                <MetricCard label="รายการเงินสดที่ข้อมูลไม่ครบ" value={`${report.cash.dataMissingCount} รายการ`} />
                            </div>
                            {report.cash.dataMissingCount > 0 ? (
                                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                    ยอดเงินสดรับ เงินทอน และเงินสดหลังทอน คิดจากออเดอร์ที่มีข้อมูลครบเท่านั้น
                                </div>
                            ) : null}
                        </Card>

                        <Card title="รายการเงินสดเข้า/ออก">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
                                <MetricCard label="เงินเข้า" value={formatMoney(report.cashMovements.cashInTotal)} />
                                <MetricCard label="เงินออก" value={formatMoney(report.cashMovements.cashOutTotal)} />
                                <MetricCard label="เงินสดสุทธิจากรายการเข้าออก" value={formatMoney(report.cashMovements.cashMovementNet)} />
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
                                                onChange={(e) => {
                                                    const nextType = e.target.value as "cash_in" | "cash_out";
                                                    setCmType(nextType);
                                                    const first = firstCashMovementReason(nextType, role);
                                                    if (first) setCmReason(first.value);
                                                    setCmNote("");
                                                }}
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40"
                                            >
                                                <option className="dark:bg-surface dark:text-text-primary" value="cash_in">เงินเข้า</option>
                                                <option className="dark:bg-surface dark:text-text-primary" value="cash_out">เงินออก</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-text-secondary block mb-1">เหตุผล</label>
                                            <select
                                                value={cmReason}
                                                onChange={(e) => setCmReason(e.target.value)}
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40"
                                            >
                                                {cmReasonOptions.map((reason) => (
                                                    <option key={`${reason.type}-${reason.value}`} className="dark:bg-surface dark:text-text-primary" value={reason.value}>
                                                        {reason.label}
                                                    </option>
                                                ))}
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
                                            <label className="text-xs text-text-secondary block mb-1">{isCmNoteRequired ? "หมายเหตุ (จำเป็น)" : "หมายเหตุ (ไม่บังคับ)"}</label>
                                            <input
                                                type="text"
                                                value={cmNote}
                                                onChange={(e) => setCmNote(e.target.value)}
                                                placeholder={selectedCmReasonPolicy?.notePlaceholder ?? "เช่น เติมจากธนาคาร"}
                                                className="w-full rounded-lg border border-[var(--text-muted)]/20 bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-[var(--text-muted)]/40 placeholder:text-text-muted"
                                                disabled={cmLoading}
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button
                                                type="submit"
                                                disabled={cmLoading || !cmAmount || Number(cmAmount) <= 0 || (isCmNoteRequired && cmNote.trim() === "")}
                                                className="w-full"
                                            >
                                                {cmLoading ? "กำลังบันทึก..." : "บันทึกรายการ"}
                                            </Button>
                                        </div>
                                    </div>
                                    {selectedCmReasonPolicy?.notePlaceholder ? (
                                        <div className="text-xs text-text-secondary">{selectedCmReasonPolicy.notePlaceholder}</div>
                                    ) : null}
                                    {cmError ? (
                                        <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                                            {cmError}
                                        </div>
                                    ) : null}
                                </form>
                            ) : (
                                <div className="border-t border-white/10 pt-3 text-xs text-text-secondary">
                                    ปิดยอดแล้วหรืออนุมัติแล้ว จึงเพิ่มรายการเงินสดไม่ได้
                                </div>
                            )}

                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[600px] text-xs md:text-sm">
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
                                                        {movement.type === "cash_in" ? "เงินเข้า" : "เงินออก"}
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
                            <Card title="ข้อมูลที่ควรตรวจสอบ">
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
                                ยังไม่มีออเดอร์ที่ชำระแล้วหรือยกเลิกในวันที่เลือก
                            </div>
                        ) : null}

                        <Card title={`ออเดอร์ที่ชำระแล้ว (${report.paidTransactions.length})`}>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-xs md:text-sm">
                                    <thead className="text-left text-xs text-text-secondary">
                                        <tr className="border-b border-white/10">
                                            <th className="px-3 py-2">เวลา</th>
                                            <th className="px-3 py-2">ออเดอร์</th>
                                            <th className="px-3 py-2">วิธีชำระเงิน</th>
                                            <th className="px-3 py-2 text-right">ยอดขายรวม</th>
                                            <th className="px-3 py-2 text-right">รับเงิน / เงินทอน</th>
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
                                                                <span className="ml-1 text-amber-300" title="ใช้เวลาสร้างออเดอร์เพราะไม่มีเวลาชำระเงิน">
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
                                                    ยังไม่มีรายการชำระเงิน
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <Card title={`ออเดอร์ที่ยกเลิก (${report.cancelledTransactions.length})`}>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] text-xs md:text-sm">
                                    <thead className="text-left text-xs text-text-secondary">
                                        <tr className="border-b border-white/10">
                                            <th className="px-3 py-2">เวลายกเลิก</th>
                                            <th className="px-3 py-2">ออเดอร์</th>
                                            <th className="px-3 py-2 text-right">ยอดก่อนยกเลิก</th>
                                            <th className="px-3 py-2">เหตุผล</th>
                                            <th className="px-3 py-2">หมายเหตุ</th>
                                            <th className="px-3 py-2">ผลกระทบต่อสต็อก</th>
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
                                                        {transaction.stockRefunded ? "คืนสต็อกแล้ว" : "ไม่ได้คืนสต็อก"}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-6 text-center text-text-secondary">
                                                    ยังไม่มีออเดอร์ที่ยกเลิกในวันที่เลือก
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
                                    <table className="w-full min-w-[900px] text-xs md:text-sm">
                                        <thead className="text-left text-xs text-text-secondary">
                                            <tr className="border-b border-white/10">
                                                <th className="px-3 py-2">วันที่ขาย</th>
                                                <th className="px-3 py-2">สถานะ</th>
                                                <th className="px-3 py-2 text-right">ยอดขายรวม</th>
                                                <th className="px-3 py-2 text-right">จำนวนออเดอร์</th>
                                                <th className="px-3 py-2 text-right">เงินสดที่ควรอยู่ในลิ้นชัก</th>
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
                                                                    <span className="text-amber-300">{closeStatusLabel(row.status)}</span>
                                                                ) : row.status === "closed" ? (
                                                                    <span className="text-green-300">{closeStatusLabel(row.status)}</span>
                                                                ) : row.status === "approved" ? (
                                                                    <span className="text-emerald-300">{closeStatusLabel(row.status)}</span>
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
