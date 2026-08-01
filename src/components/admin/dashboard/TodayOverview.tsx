"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArrowRight,
    Banknote,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    PackageX,
    ReceiptText,
} from "lucide-react";
import Card from "@/components/admin/Card";
import type { DashboardTodayResponse } from "@/lib/dashboardToday";
import {
    buildDashboardTodayPresentation,
    type DashboardTodayAction,
} from "@/lib/dashboardTodayPresentation";

const money = (value: number) =>
    `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿`;

const thaiDate = (dateKey: string) =>
    new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Bangkok",
    }).format(new Date(`${dateKey}T12:00:00+07:00`));

const overviewToneStyles = {
    danger: "border-red-500/30 bg-red-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    neutral: "border-sky-500/25 bg-sky-500/5",
    success: "border-emerald-500/25 bg-emerald-500/5",
};

function OverviewIcon({ tone }: { tone: "danger" | "warning" | "neutral" | "success" }) {
    const className = "h-6 w-6";
    if (tone === "danger") return <AlertTriangle className={className} />;
    if (tone === "warning") return <ClipboardCheck className={className} />;
    if (tone === "neutral") return <Eye className={className} />;
    return <CheckCircle2 className={className} />;
}

function ActionIcon({ action }: { action: DashboardTodayAction }) {
    if (action.id === "critical-stock" || action.id === "stock-warning") {
        return <PackageX size={20} />;
    }
    if (action.id === "cash-variance") return <Banknote size={20} />;
    return <ClipboardCheck size={20} />;
}

function SectionTitle({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-[var(--accent)]/10 p-2 text-[var(--accent)]">
                {icon}
            </span>
            <div className="min-w-0">
                <h2 className="text-lg font-bold text-[var(--text-primary)] md:text-xl">{title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
            </div>
        </div>
    );
}

export default function TodayOverview() {
    const [data, setData] = useState<DashboardTodayResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        fetch("/api/dashboard/today", { cache: "no-store" })
            .then(async (response) => {
                const body = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | DashboardTodayResponse
                    | null;
                if (!response.ok) {
                    throw new Error(
                        body && "error" in body ? body.error : "โหลดภาพรวมวันนี้ไม่สำเร็จ",
                    );
                }
                if (active) setData(body as DashboardTodayResponse);
            })
            .catch(
                (reason: unknown) =>
                    active &&
                    setError(reason instanceof Error ? reason.message : "โหลดภาพรวมวันนี้ไม่สำเร็จ"),
            )
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="animate-pulse space-y-5">
                <div className="h-20 rounded-2xl bg-[var(--surface)]" />
                <div className="h-44 rounded-2xl bg-[var(--surface)]" />
                <div className="h-56 rounded-2xl bg-[var(--surface)]" />
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <div className="flex gap-3 text-red-600 dark:text-red-300">
                    <AlertTriangle className="shrink-0" />
                    <div>
                        <h1 className="font-bold">เปิดภาพรวมวันนี้ไม่ได้</h1>
                        <p className="mt-1 text-sm">{error}</p>
                    </div>
                </div>
            </Card>
        );
    }

    if (!data) return null;

    const presentation = buildDashboardTodayPresentation(data);
    const yesterdayLabel = thaiDate(data.dates.yesterday.date);

    return (
        <div className="space-y-6 md:space-y-8">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--accent)]">
                        สำหรับ Owner · {data.context.branchName}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
                        ภาพรวมวันนี้
                    </h1>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                        สรุปสิ่งที่ต้องจัดการและผลการขายของ {yesterdayLabel}
                    </p>
                </div>
                <Link
                    href="/admin/reports"
                    className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--text-muted)]/25 px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--accent)]/10"
                >
                    ดูรายงานย้อนหลัง <ArrowRight size={16} />
                </Link>
            </header>

            <Card className={overviewToneStyles[presentation.overview.tone]}>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 gap-4">
                        <span className="shrink-0 rounded-2xl bg-[var(--surface)] p-3 text-[var(--text-primary)] shadow-sm">
                            <OverviewIcon tone={presentation.overview.tone} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                สรุปสถานการณ์
                            </p>
                            <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)] md:text-2xl">
                                {presentation.overview.title}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                {presentation.overview.description}
                            </p>
                        </div>
                    </div>
                    {presentation.overview.primaryAction ? (
                        <Link
                            href={presentation.overview.primaryAction.href}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white hover:opacity-90"
                        >
                            {presentation.overview.primaryAction.label}
                            <ArrowRight size={16} />
                        </Link>
                    ) : null}
                </div>
            </Card>

            {presentation.visibleActions.length > 0 ? (
                <section className="space-y-3">
                    <SectionTitle
                        icon={<ClipboardCheck size={20} />}
                        title="เรื่องที่ต้องจัดการ"
                        description="เรียงตามความสำคัญและแสดงเรื่องที่ควรทำก่อน"
                    />
                    <Card>
                        <div className="divide-y divide-[var(--text-muted)]/15">
                            {presentation.visibleActions.map((action) => (
                                <Link
                                    key={action.id}
                                    href={action.href}
                                    className="group flex items-start gap-3 py-4 first:pt-0 last:pb-0"
                                >
                                    <span
                                        className={`mt-0.5 shrink-0 rounded-xl p-2 ${
                                            action.tone === "danger"
                                                ? "bg-red-500/10 text-red-600 dark:text-red-300"
                                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                        }`}
                                    >
                                        <ActionIcon action={action} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-bold text-[var(--text-primary)]">
                                            {action.title}
                                        </span>
                                        <span className="mt-1 block text-sm leading-6 text-[var(--text-muted)]">
                                            {action.description}
                                        </span>
                                    </span>
                                    <span className="mt-2 inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent)]">
                                        <span className="hidden sm:inline">{action.label}</span>
                                        <ArrowRight
                                            size={16}
                                            className="transition-transform group-hover:translate-x-0.5"
                                        />
                                    </span>
                                </Link>
                            ))}
                        </div>
                        {presentation.hiddenActionCount > 0 && presentation.nextHiddenAction ? (
                            <Link
                                href={presentation.nextHiddenAction.href}
                                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"
                            >
                                ยังมีอีก {presentation.hiddenActionCount} เรื่อง
                                <ArrowRight size={15} />
                            </Link>
                        ) : null}
                    </Card>
                </section>
            ) : null}

            <section className="space-y-3">
                <SectionTitle
                    icon={<ReceiptText size={20} />}
                    title="สรุปเมื่อวาน"
                    description={`ยอดชำระแล้วของ ${yesterdayLabel}`}
                />
                {!presentation.hasSales ? (
                    <Card className="py-4">
                        <p className="font-semibold text-[var(--text-primary)]">
                            เมื่อวานไม่มีรายการขาย
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                            ไม่พบออเดอร์ที่ชำระแล้วในวันที่ดังกล่าว
                        </p>
                    </Card>
                ) : (
                    <Card>
                        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr_1fr] lg:items-center">
                            <div>
                                <p className="text-sm text-[var(--text-muted)]">ยอดขายเมื่อวาน</p>
                                <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                                    {money(data.sales.netSales)}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-[var(--text-muted)]">จำนวนออเดอร์</p>
                                    <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">
                                        {data.sales.paidOrderCount.toLocaleString("th-TH")}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)]">เฉลี่ยต่อบิล</p>
                                    <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">
                                        {money(data.sales.averageOrderValue)}
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-2 border-t border-[var(--text-muted)]/15 pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                                <p className="flex items-center justify-between gap-4">
                                    <span className="inline-flex items-center gap-2">
                                        <Banknote size={16} /> เงินสด
                                    </span>
                                    <b>{money(data.sales.cashSales)}</b>
                                </p>
                                <p className="flex items-center justify-between gap-4">
                                    <span>PromptPay</span>
                                    <b>{money(data.sales.promptPaySales)}</b>
                                </p>
                                {data.sales.otherSales > 0 ? (
                                    <p className="flex items-center justify-between gap-4 text-[var(--text-muted)]">
                                        <span>วิธีอื่น/ไม่ระบุ</span>
                                        <b>{money(data.sales.otherSales)}</b>
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    </Card>
                )}
            </section>

            {presentation.reviewGroups.length > 0 ? (
                <section className="space-y-3">
                    <SectionTitle
                        icon={<Eye size={20} />}
                        title="เหตุการณ์ที่ควรรู้"
                        description={`พบ ${presentation.reviewCount.toLocaleString("th-TH")} เหตุการณ์จากข้อมูลเมื่อวาน`}
                    />
                    <Card>
                        <div className="divide-y divide-[var(--text-muted)]/15">
                            {presentation.reviewGroups.map((group) => (
                                <Link
                                    key={group.id}
                                    href={group.href}
                                    className="group flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                                >
                                    <span className="min-w-0">
                                        <span className="block font-semibold text-[var(--text-primary)]">
                                            {group.title}
                                        </span>
                                        <span className="mt-1 block text-sm leading-6 text-[var(--text-muted)]">
                                            {group.description}
                                        </span>
                                    </span>
                                    <ArrowRight
                                        size={16}
                                        className="mt-1 shrink-0 text-[var(--accent)] transition-transform group-hover:translate-x-0.5"
                                    />
                                </Link>
                            ))}
                        </div>
                    </Card>
                </section>
            ) : null}
        </div>
    );
}
