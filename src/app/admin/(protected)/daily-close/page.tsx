"use client";

import { useEffect, useMemo, useState } from "react";

import Card from "@/components/admin/Card";

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
    cancellations: { count: number; originalValue: number };
    paidTransactions: PaidTransaction[];
    cancelledTransactions: CancelledTransaction[];
    dataQuality: DataQualityWarning[];
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

    const isEmpty = useMemo(
        () =>
            Boolean(report) &&
            report!.paidTransactions.length === 0 &&
            report!.cancelledTransactions.length === 0,
        [report]
    );

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

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Live report — ยังไม่ใช่การปิดกะหรือการล็อกยอด รายงานอาจเปลี่ยนได้หากสถานะออเดอร์เปลี่ยนภายหลัง
                </div>

                {error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
                        {error}
                    </div>
                ) : null}

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
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                                <MetricCard label="ยอดขายเงินสด" value={formatMoney(report.cash.sales)} />
                                <MetricCard label="รับเงิน" value={formatMoney(report.cash.tendered)} />
                                <MetricCard label="เงินทอน" value={formatMoney(report.cash.change)} />
                                <MetricCard label="เงินสดคงเหลือจากรายการ" value={formatMoney(report.cash.retained)} />
                                <MetricCard label="ข้อมูลเงินสดไม่ครบ" value={`${report.cash.dataMissingCount} รายการ`} />
                            </div>
                            {report.cash.dataMissingCount > 0 ? (
                                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                    ยอดรับ เงินทอน และเงินสดคงเหลือเป็นผลรวมจากรายการที่มีข้อมูลเท่านั้น
                                </div>
                            ) : null}
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
                    </>
                ) : null}
            </div>
        </div>
    );
}
