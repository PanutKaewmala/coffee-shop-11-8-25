"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, ClipboardCheck, PackageCheck, ReceiptText } from "lucide-react";
import Card from "@/components/admin/Card";
import type { DashboardTodayResponse } from "@/lib/dashboardToday";
import { buildDashboardTodayPresentation } from "@/lib/dashboardTodayPresentation";

const money = (value: number) => `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿`;

function SectionTitle({ icon, id, title, description }: { icon: React.ReactNode; id: string; title: string; description: string }) {
    return <div className="flex items-start gap-3"><span className="mt-0.5 shrink-0 rounded-xl bg-[var(--accent)]/10 p-2 text-[var(--accent)]">{icon}</span><div className="min-w-0"><h2 id={id} className="text-lg font-bold text-[var(--text-primary)] md:text-xl">{title}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p></div></div>;
}

const actionTone = {
    critical: "border-red-500/30 bg-red-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
};

export default function TodayOverview() {
    const [data, setData] = useState<DashboardTodayResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        fetch("/api/dashboard/today", { cache: "no-store" }).then(async (response) => {
            const body = await response.json().catch(() => null) as { error?: string } | DashboardTodayResponse | null;
            if (!response.ok) throw new Error(body && "error" in body ? body.error : "โหลดภาพรวมวันนี้ไม่สำเร็จ");
            if (active) setData(body as DashboardTodayResponse);
        }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "โหลดภาพรวมวันนี้ไม่สำเร็จ"))
          .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, []);

    if (loading) return <div className="space-y-5 animate-pulse"><div className="h-44 rounded-2xl bg-[var(--surface)]"/><div className="h-48 rounded-2xl bg-[var(--surface)]"/><div className="h-48 rounded-2xl bg-[var(--surface)]"/></div>;
    if (error) return <Card><div className="flex gap-3 text-red-600 dark:text-red-300"><AlertTriangle className="shrink-0"/><div><h1 className="font-bold">เปิดภาพรวมวันนี้ไม่ได้</h1><p className="mt-1 text-sm">{error}</p></div></div></Card>;
    if (!data) return null;

    const view = buildDashboardTodayPresentation(data);

    return <div className="space-y-6 md:space-y-8">
        <header>
            <p className="text-sm font-medium text-[var(--accent)]">สำหรับ Owner · {data.context.branchName}</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">ภาพรวมวันนี้</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">ข้อมูลของสาขาที่เลือก · อ้างอิงเวลาไทย</p>
        </header>

        <section aria-labelledby="situation-title">
            <Card className={`overflow-hidden border-[var(--accent)]/30 bg-[var(--accent)]/5 ${view.overview.actionCount === 0 && !view.overview.primaryAction ? "!p-4" : ""}`}>
                <div className={`flex flex-col md:flex-row md:items-center md:justify-between ${view.overview.actionCount === 0 && !view.overview.primaryAction ? "gap-3" : "gap-5"}`}>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--accent)]">สรุปสถานการณ์</p>
                        <h2 id="situation-title" className="mt-2 text-xl font-bold text-[var(--text-primary)] md:text-2xl">{view.overview.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{view.overview.description}</p>
                        {view.overview.actionCount > 0 ? <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">มี {view.overview.actionCount.toLocaleString("th-TH")} เรื่องที่ต้องจัดการ</p> : null}
                    </div>
                    {view.overview.primaryAction ? <Link href={view.overview.primaryAction.href} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{view.overview.primaryAction.label}<ArrowRight size={16}/></Link> : null}
                </div>
            </Card>
        </section>

        {view.actions.length > 0 ? <section className="space-y-3" aria-labelledby="actions-title">
            <SectionTitle id="actions-title" icon={<ClipboardCheck size={20}/>} title="เรื่องที่ต้องจัดการ" description={`เรียงตามความสำคัญทั้งหมด ${view.actions.length.toLocaleString("th-TH")} กลุ่ม`}/>
            <div className="grid gap-4 lg:grid-cols-3">
                {view.visibleActions.map((action) => <Card key={action.id} className={actionTone[action.tone]}>
                    <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-[var(--text-primary)]">{action.title}</h3><span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-bold">{action.itemCount.toLocaleString("th-TH")} รายการ</span></div>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{action.description}</p>
                        {action.examples.length ? <p className="mt-2 text-sm text-[var(--text-muted)]">ตัวอย่าง: {action.examples.join(", ")}</p> : null}
                        <Link href={action.href} className="mt-5 inline-flex items-center gap-2 self-start rounded-lg font-semibold text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{action.linkLabel}<ArrowRight size={15}/></Link>
                    </div>
                </Card>)}
            </div>
            {view.hiddenActionCount > 0 ? <p className="text-sm font-medium text-[var(--text-muted)]">มีอีก {view.hiddenActionCount.toLocaleString("th-TH")} กลุ่มที่ไม่ได้แสดงในรายการเด่น</p> : null}
        </section> : null}

        <section className="space-y-3" aria-labelledby="sales-title">
            <SectionTitle id="sales-title" icon={<ReceiptText size={20}/>} title="สรุปเมื่อวาน" description={`ยอดชำระแล้วเมื่อวาน · ${view.formattedYesterdayDate}`}/>
            {view.hasPaidSales ? <Card><div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div><p className="text-xs text-[var(--text-muted)]">ยอดขายเมื่อวาน</p><p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{money(data.sales.netSales)}</p></div>
                <div><p className="text-xs text-[var(--text-muted)]">จำนวนออเดอร์</p><p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{data.sales.paidOrderCount.toLocaleString("th-TH")}</p></div>
                <div><p className="text-xs text-[var(--text-muted)]">เฉลี่ยต่อบิล</p><p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{money(data.sales.averageOrderValue)}</p></div>
                <div><p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><Banknote size={14}/>เงินสด</p><p className="mt-1 font-bold text-[var(--text-primary)]">{money(data.sales.cashSales)}</p></div>
                <div><p className="text-xs text-[var(--text-muted)]">PromptPay</p><p className="mt-1 font-bold text-[var(--text-primary)]">{money(data.sales.promptPaySales)}</p></div>
                {data.sales.otherSales > 0 ? <div><p className="text-xs text-[var(--text-muted)]">วิธีอื่น/ไม่ระบุ</p><p className="mt-1 font-bold text-[var(--text-primary)]">{money(data.sales.otherSales)}</p></div> : null}
            </div></Card> : <Card><div className="flex items-start gap-3"><PackageCheck className="shrink-0 text-[var(--accent)]"/><div><p className="font-bold text-[var(--text-primary)]">เมื่อวานไม่มีรายการขาย</p><p className="mt-1 text-sm text-[var(--text-muted)]">ไม่พบออเดอร์ที่ชำระแล้วในวันที่ดังกล่าว</p></div></div></Card>}
        </section>

        {view.reviews.length > 0 ? <section className="space-y-3" aria-labelledby="reviews-title">
            <SectionTitle id="reviews-title" icon={<AlertTriangle size={20}/>} title="รายการที่ควรตรวจ" description={`พบ ${view.reviewCount.toLocaleString("th-TH")} รายการที่ควรตรวจเพิ่มเติม`}/>
            <div className="grid gap-4 md:grid-cols-2">{view.reviews.map((review) => <Card key={review.id}>
                <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-[var(--text-primary)]">{review.title}</h3><span className="shrink-0 text-sm font-bold">{review.itemCount.toLocaleString("th-TH")} รายการ</span></div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{review.description}</p>
                <Link href={review.href} className="mt-4 inline-flex items-center gap-2 rounded-lg font-semibold text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">{review.linkLabel}<ArrowRight size={15}/></Link>
            </Card>)}</div>
        </section> : null}
    </div>;
}
