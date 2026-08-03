"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ReceiptText } from "lucide-react";
import Card from "@/components/admin/Card";
import ReportsSalesCalendar from "@/components/admin/reports/ReportsSalesCalendar";
import ReportsSalesTrendChart from "@/components/admin/reports/ReportsSalesTrendChart";
import ReportsDateRangePicker from "@/components/admin/reports/ReportsDateRangePicker";
import {
    REPORTS_SALES_RANGE_KEYS,
    type ReportsSalesMenu,
    type ReportsSalesPayment,
    type ReportsSalesRangeKey,
    type ReportsSalesResponse,
} from "@/lib/reportsSales";
import { buildReportsSalesRangeSearch, parseReportsSalesRangeQuery, type ReportsSalesRangeQuery } from "@/lib/reportsSalesRangeQuery";
import {
    buildReportsKpis,
    formatReportsDateRange,
    formatReportsMoney,
    formatReportsPercent,
    hasReportsDataQualityIssues,
    isReportsMainEmpty,
    isReportsAbortError,
    isReportsRequestCurrent,
    REPORTS_MENU_EMPTY_MESSAGE,
    reportsErrorMessage,
    reportsRequestFailureMessage,
    reportsSalesRangeLabels,
    salesSituation,
    shouldShowReportsSalesSituation,
    shouldShowReportsContext,
    trendTitle,
    visibleReportsMenus,
} from "@/lib/reportsSalesPresentation";

class ReportsHttpError extends Error {}

const paymentLabels: Record<ReportsSalesPayment["method"], string> = {
    cash: "เงินสด",
    promptpay: "PromptPay",
    unknown: "ไม่ระบุวิธีชำระ",
};

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
    return <div><h2 id={id} className="text-lg font-bold text-[var(--text-primary)] md:text-xl">{title}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p></div>;
}

function LoadingSkeleton() {
    return <div className="animate-pulse space-y-6" aria-label="กำลังโหลดรายงานยอดขาย">
        <div className="h-24 rounded-2xl bg-[var(--surface)]"/>
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-36 rounded-2xl bg-[var(--surface)]"/>)}</div>
        <div className="h-[360px] rounded-2xl bg-[var(--surface)]"/>
        <div className="grid gap-4 lg:grid-cols-2"><div className="h-64 rounded-2xl bg-[var(--surface)]"/><div className="h-64 rounded-2xl bg-[var(--surface)]"/></div>
    </div>;
}

function Delta({ amount, percent, kind }: { amount: number; percent: number | null; kind: "money" | "count" }) {
    const symbol = amount > 0 ? "↑" : amount < 0 ? "↓" : "→";
    const formattedAmount = kind === "money"
        ? formatReportsMoney(Math.abs(amount))
        : `${Math.abs(amount).toLocaleString("th-TH")} ออเดอร์`;
    return <div className="mt-3 border-t border-black/5 pt-3 text-xs dark:border-white/10">
        <p className="font-semibold text-[var(--text-secondary)]">{symbol} {formattedAmount}{percent === null ? "" : ` (${formatReportsPercent(percent)})`}</p>
        <p className="mt-1 text-[var(--text-muted)]">เทียบช่วงก่อนหน้า</p>
    </div>;
}

function PaymentBreakdown({ payments }: { payments: ReportsSalesPayment[] }) {
    const visible = payments.filter((payment) => payment.method !== "unknown" || payment.paidSales > 0 || payment.paidOrderCount > 0);
    return <div className="space-y-4">{visible.map((payment) => <div key={payment.method}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-semibold text-[var(--text-primary)]">{paymentLabels[payment.method]}</p>
            <p className="font-bold text-[var(--text-primary)]">{formatReportsMoney(payment.paidSales)}</p>
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[var(--text-muted)]"><span>{payment.paidOrderCount.toLocaleString("th-TH")} ออเดอร์</span><span>{formatReportsPercent(payment.contributionPercent)}</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, payment.contributionPercent))}%` }}/></div>
    </div>)}</div>;
}

function MenuRow({ menu, rank }: { menu: ReportsSalesMenu; rank: number }) {
    const [expanded, setExpanded] = useState(false);
    const hasVariants = menu.variants.length > 0;
    return <article className="rounded-xl border border-black/5 p-4 dark:border-white/10">
        <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent)]">{rank}</span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><h3 className="break-words font-semibold text-[var(--text-primary)]">{menu.name}</h3><p className="shrink-0 font-bold text-[var(--text-primary)]">{formatReportsMoney(menu.revenue)}</p></div>
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[var(--text-muted)]"><span>{menu.quantity.toLocaleString("th-TH")} รายการ</span><span>{formatReportsPercent(menu.contributionPercent)}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, menu.contributionPercent))}%` }}/></div>
                {hasVariants ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="mt-3 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                    {expanded ? "ซ่อนรายละเอียดตัวเลือก" : "ดูรายละเอียดตัวเลือก"}{expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>} </button> : null}
                {expanded ? <div className="mt-3 space-y-2 border-t border-black/5 pt-3 dark:border-white/10">{menu.variants.map((variant) => <div key={variant.key} className="rounded-lg bg-[var(--background)] p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><span className="break-words font-medium text-[var(--text-primary)]">{variant.label}</span><span className="font-semibold text-[var(--text-primary)]">{formatReportsMoney(variant.revenue)}</span></div>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{variant.quantity.toLocaleString("th-TH")} รายการ · {formatReportsPercent(variant.contributionPercentWithinMenu)} ของเมนูนี้</p>
                </div>)}</div> : null}
            </div>
        </div>
    </article>;
}

function MenuContribution({ menus }: { menus: ReportsSalesMenu[] }) {
    const [showAll, setShowAll] = useState(false);
    const displayed = visibleReportsMenus(menus, showAll);
    if (menus.length === 0) {
        return <div className="rounded-xl border border-dashed border-black/10 p-5 text-center dark:border-white/15">
            <p className="font-semibold text-[var(--text-primary)]">{REPORTS_MENU_EMPTY_MESSAGE}</p>
        </div>;
    }
    return <><div className="space-y-3">{displayed.map((menu, index) => <MenuRow key={menu.key} menu={menu} rank={index + 1}/>)}</div>
        {menus.length > 5 ? <button type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
            {showAll ? "ซ่อนรายการเพิ่มเติม" : "ดูทั้งหมด"}{showAll ? <ChevronUp size={16}/> : <ChevronDown size={16}/>} </button> : null}</>;
}

export default function ReportsSalesDashboard() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const search = searchParams.toString();
    const parsedQuery = useMemo(() => parseReportsSalesRangeQuery(new URLSearchParams(search)), [search]);
    const activeQuery: ReportsSalesRangeQuery = useMemo(() => parsedQuery.ok ? parsedQuery.value : { key: "7d", start: null, end: null, allTime: false }, [parsedQuery]);
    const selectedRange = activeQuery.key;
    const [data, setData] = useState<ReportsSalesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [salesView, setSalesView] = useState<"calendar" | "graph">("calendar");
    const [pickerOpen, setPickerOpen] = useState(false);
    const customTriggerRef = useRef<HTMLButtonElement>(null);
    const activeControllerRef = useRef<AbortController | null>(null);
    const requestVersionRef = useRef(0);

    const load = useCallback(async (query: ReportsSalesRangeQuery, controller: AbortController, requestVersion: number) => {
        const isCurrent = () => isReportsRequestCurrent(requestVersionRef.current, requestVersion, controller.signal.aborted);
        try {
            const response = await fetch(`/api/reports/sales?${buildReportsSalesRangeSearch(query)}`, { cache: "no-store", signal: controller.signal });
                const parsed = await response.json()
                    .then((body: unknown) => ({ valid: true as const, body }))
                    .catch(() => ({ valid: false as const, body: null }));
                const body = parsed.body;
                const apiError = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : null;
                if (!response.ok) throw new ReportsHttpError(reportsErrorMessage(response.status, apiError));
                if (!parsed.valid || typeof body !== "object" || body === null) throw new Error("Invalid reports response");
            if (isCurrent()) setData(body as ReportsSalesResponse);
        } catch (reason: unknown) {
            if (!isCurrent() || isReportsAbortError(reason)) return;
            setData(null);
            setError(reportsRequestFailureMessage(reason, reason instanceof ReportsHttpError ? reason.message : null));
        } finally {
            if (isCurrent()) {
                activeControllerRef.current = null;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (parsedQuery.ok) return;
        const normalized = new URLSearchParams(search);
        normalized.set("range", "7d");
        normalized.delete("start"); normalized.delete("end"); normalized.delete("preset");
        router.replace(`${pathname}?${normalized.toString()}`);
    }, [parsedQuery.ok, pathname, router, search]);

    useEffect(() => {
        if (!parsedQuery.ok) return;
        const controller = new AbortController();
        const requestVersion = ++requestVersionRef.current;
        activeControllerRef.current = controller;
        setLoading(true); setError(null); setData(null);
        void load(activeQuery, controller, requestVersion);
        return () => {
            controller.abort();
            if (requestVersionRef.current === requestVersion) requestVersionRef.current += 1;
            if (activeControllerRef.current === controller) activeControllerRef.current = null;
        };
    }, [activeQuery, load, parsedQuery.ok, retryKey, search]);

    const invalidateActiveRequest = () => {
        requestVersionRef.current += 1;
        activeControllerRef.current?.abort();
        activeControllerRef.current = null;
    };

    const navigate = (query: ReportsSalesRangeQuery) => {
        invalidateActiveRequest();
        setLoading(true);
        setError(null);
        setData(null);
        const next = new URLSearchParams(search);
        next.delete("range"); next.delete("start"); next.delete("end"); next.delete("preset");
        new URLSearchParams(buildReportsSalesRangeSearch(query)).forEach((value, key) => next.set(key, value));
        router.push(`${pathname}?${next.toString()}`);
    };

    const selectRange = (range: ReportsSalesRangeKey) => {
        if (range === "custom") { setPickerOpen(true); return; }
        if (range === selectedRange) return;
        navigate({ key: range, start: null, end: null, allTime: false });
    };

    const closePicker = useCallback(() => { setPickerOpen(false); requestAnimationFrame(() => customTriggerRef.current?.focus()); }, []);
    const applyCustom = (query: ReportsSalesRangeQuery) => { setPickerOpen(false); navigate(query); requestAnimationFrame(() => customTriggerRef.current?.focus()); };

    const retry = () => {
        invalidateActiveRequest();
        setLoading(true);
        setError(null);
        setData(null);
        setRetryKey((value) => value + 1);
    };

    const empty = data ? isReportsMainEmpty(data) : false;
    return <div className="min-w-0 space-y-6 md:space-y-8">
        <header className="space-y-4">
            <div><h1 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">รายงานยอดขาย</h1><p className="mt-2 text-sm text-[var(--text-muted)]">ดูแนวโน้มยอดขาย ช่องทางชำระ และเมนูที่ทำยอด</p>
                {shouldShowReportsContext(loading, data !== null) && data ? <><p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">{data.context.isAllBranches ? "ทุกสาขา" : data.context.branchName} · อ้างอิงเวลาไทย</p><p className="mt-1 text-xs text-[var(--text-muted)]">{formatReportsDateRange(data.range)}</p></> : null}
            </div>
            <div className="grid max-w-2xl grid-cols-3 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="เลือกช่วงเวลารายงาน">
                {REPORTS_SALES_RANGE_KEYS.map((range) => <button type="button" key={range} ref={range === "custom" ? customTriggerRef : undefined} aria-pressed={selectedRange === range} aria-haspopup={range === "custom" ? "dialog" : undefined} onClick={() => selectRange(range)} className={`min-h-11 min-w-0 rounded-xl border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 sm:px-4 ${selectedRange === range ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm ring-2 ring-[var(--accent)]/25" : "border-black/10 bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)] dark:border-white/10"}`}>{reportsSalesRangeLabels[range]}</button>)}
            </div>
        </header>
        {pickerOpen ? <ReportsDateRangePicker open applied={activeQuery} onClose={closePicker} onApply={applyCustom}/> : null}

        {loading ? <LoadingSkeleton/> : error ? <Card><div className="flex items-start gap-3"><AlertTriangle className="shrink-0 text-red-600 dark:text-red-300"/><div><h2 className="font-bold text-[var(--text-primary)]">เปิดรายงานไม่ได้</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{error}</p><button type="button" onClick={retry} className="mt-4 min-h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white">ลองใหม่</button></div></div></Card> : data ? <>
            {shouldShowReportsSalesSituation(data) ? <section aria-labelledby="situation-heading"><Card className="border-[var(--accent)]/25 bg-[var(--accent)]/5"><p className="text-sm font-semibold text-[var(--accent)]">สรุปสถานการณ์ยอดขาย</p><h2 id="situation-heading" className="mt-2 text-lg font-bold leading-7 text-[var(--text-primary)] md:text-xl">{salesSituation(data.summary, data.comparison)}</h2></Card></section> : null}

            {empty ? <Card><div className="flex items-start gap-3"><ReceiptText className="shrink-0 text-[var(--accent)]"/><div><h2 className="font-bold text-[var(--text-primary)]">ยังไม่มียอดขายที่ชำระแล้วในช่วงนี้</h2><p className="mt-1 text-sm text-[var(--text-muted)]">ลองเลือกช่วงเวลาอื่น หรือตรวจสอบสาขาที่กำลังดู</p></div></div></Card> : <>
                <section className="space-y-3" aria-labelledby="kpi-heading"><SectionHeading id="kpi-heading" title="ภาพรวมยอดขาย" description="ตัวเลขจากออเดอร์ที่ชำระแล้วในช่วงที่เลือก"/><div className="grid gap-4 md:grid-cols-3">{buildReportsKpis(data).map((kpi) => <Card key={kpi.label}><p className="text-sm text-[var(--text-muted)]">{kpi.label}</p><p className="mt-2 break-words text-xl font-bold text-[var(--text-primary)] md:text-2xl">{kpi.value}</p>{data.comparison.available && kpi.delta !== null ? <Delta amount={kpi.delta} percent={kpi.deltaPercent} kind={kpi.deltaKind}/> : <p className="mt-3 border-t border-black/5 pt-3 text-xs text-[var(--text-muted)] dark:border-white/10">ไม่มีช่วงเปรียบเทียบ</p>}</Card>)}</div></section>
                <section className="min-w-0 space-y-3" aria-labelledby="daily-sales-heading">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><SectionHeading id="daily-sales-heading" title="แนวโน้มยอดขาย" description="ดูยอดขายผ่านปฏิทินรายวันหรือกราฟตามช่วงเวลา"/><div className="inline-flex self-start rounded-xl bg-black/5 p-1 dark:bg-white/10" role="group" aria-label="เลือกรูปแบบยอดขายตามวัน"><button type="button" aria-pressed={salesView === "calendar"} onClick={() => setSalesView("calendar")} className={`min-h-11 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--surface)] ${salesView === "calendar" ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>ปฏิทิน</button><button type="button" aria-pressed={salesView === "graph"} onClick={() => setSalesView("graph")} className={`min-h-11 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--surface)] ${salesView === "graph" ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>กราฟ</button></div></div>
                    <Card className="min-w-0 overflow-hidden">{salesView === "calendar" ? <ReportsSalesCalendar key={`${data.calendar.startDateInclusive}|${data.calendar.endDateExclusive}`} calendar={data.calendar}/> : <><h3 className="sr-only">{trendTitle(data.range.granularity)}</h3><ReportsSalesTrendChart trend={data.trend} granularity={data.range.granularity}/></>}</Card>
                </section>
                <section className="space-y-3" aria-labelledby="payments-heading"><SectionHeading id="payments-heading" title="ช่องทางชำระ" description="สัดส่วนยอดขายและจำนวนออเดอร์แยกตามวิธีชำระ"/><Card><PaymentBreakdown payments={data.payments}/></Card></section>
                <section className="space-y-3" aria-labelledby="menus-heading"><SectionHeading id="menus-heading" title="เมนูที่ทำรายได้" description="เรียงตามรายได้ตามลำดับที่รายงานส่งมา"/><Card><MenuContribution menus={data.menus}/></Card></section>
            </>}

            {hasReportsDataQualityIssues(data.dataQuality) ? <section className="space-y-3" aria-labelledby="quality-heading"><SectionHeading id="quality-heading" title="คุณภาพข้อมูล" description="ข้อจำกัดของข้อมูลที่อาจมีผลต่อการอ่านรายงาน"/><Card className="border-amber-500/30 bg-amber-500/5"><ul className="space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                {data.dataQuality.legacyPaidFallbackCount > 0 ? <li>ออเดอร์ชำระแล้ว {data.dataQuality.legacyPaidFallbackCount.toLocaleString("th-TH")} รายการใช้เวลาสร้างแทนเวลาชำระ</li> : null}
                {data.dataQuality.unknownPaymentCount > 0 ? <li>มี {data.dataQuality.unknownPaymentCount.toLocaleString("th-TH")} ออเดอร์ที่ไม่ระบุวิธีชำระ</li> : null}
                {data.dataQuality.itemRevenueMismatchOrderCount > 0 ? <li>ยอดรวมสินค้าไม่ตรงกับยอดออเดอร์ {data.dataQuality.itemRevenueMismatchOrderCount.toLocaleString("th-TH")} รายการ<br/>ผลต่างรวม {formatReportsMoney(data.dataQuality.itemRevenueMismatchAmount)}</li> : null}
            </ul><Link href="/admin/orders" className="mt-4 inline-flex min-h-10 items-center font-semibold text-[var(--accent)] hover:underline">ไปดูรายการออเดอร์</Link></Card></section> : null}
        </> : null}
    </div>;
}
