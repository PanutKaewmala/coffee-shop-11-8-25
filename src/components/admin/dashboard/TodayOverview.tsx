"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, ClipboardCheck, PackageX, ReceiptText } from "lucide-react";
import Card from "@/components/admin/Card";
import type { DashboardTodayResponse } from "@/lib/dashboardToday";

const money = (value: number) => `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿`;
const statusText: Record<string, string> = { cancelled: "ยกเลิก", void: "ยกเลิกก่อนชำระ", refunded: "คืนเงิน", draft: "ร่าง", closed: "ปิดแล้ว", approved: "อนุมัติแล้ว" };

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-dashed border-[var(--text-muted)]/30 p-4 text-sm text-[var(--text-muted)]">{children}</p>;
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return <div className="flex items-start gap-3"><span className="mt-0.5 rounded-xl bg-[var(--accent)]/10 p-2 text-[var(--accent)]">{icon}</span><div><h2 className="text-lg font-bold text-[var(--text-primary)] md:text-xl">{title}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p></div></div>;
}

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

    if (loading) return <div className="space-y-5 animate-pulse"><div className="h-20 rounded-2xl bg-[var(--surface)]"/><div className="h-48 rounded-2xl bg-[var(--surface)]"/><div className="h-64 rounded-2xl bg-[var(--surface)]"/></div>;
    if (error) return <Card><div className="flex gap-3 text-red-600 dark:text-red-300"><AlertTriangle className="shrink-0"/><div><h1 className="font-bold">เปิดภาพรวมวันนี้ไม่ได้</h1><p className="mt-1 text-sm">{error}</p></div></div></Card>;
    if (!data) return null;

    const close = data.yesterdayClose;
    const cashDifference = close?.cashDifference ?? null;
    const tasksCount = data.tasks.outOfStock.length + data.tasks.lowStock.length + data.tasks.expiringLots.length;
    const eventCount = data.reviewEvents.orders.length + data.reviewEvents.stock.length + (cashDifference != null && cashDifference !== 0 ? 1 : 0);

    return <div className="space-y-6 md:space-y-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div><p className="text-sm font-medium text-[var(--accent)]">สำหรับ Owner · {data.context.branchName}</p><h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">ภาพรวมวันนี้</h1><p className="mt-2 text-sm text-[var(--text-muted)]">ตรวจข้อมูลเมื่อวานและเรื่องที่ต้องจัดการของสาขาที่เลือก · เวลา Asia/Bangkok</p></div>
            <Link href="/admin/reports" className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--text-muted)]/25 px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--accent)]/10">ดูรายงานย้อนหลัง <ArrowRight size={16}/></Link>
        </header>

        <section className="space-y-3"><SectionTitle icon={<ClipboardCheck size={20}/>} title="สถานะปิดยอดเมื่อวาน" description={`ข้อมูลวันที่ ${data.dates.yesterday.date}`}/><Card>
            {!close ? <div><p className="font-semibold text-amber-700 dark:text-amber-300">ยังไม่มีการปิดยอดของเมื่อวาน</p><p className="mt-1 text-sm text-[var(--text-muted)]">ระบบไม่พบ daily close สำหรับสาขานี้ในวันที่ดังกล่าว</p><Link href="/admin/daily-close" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">ไปหน้าปิดยอด <ArrowRight size={15}/></Link></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-[var(--text-muted)]">สถานะ</p><p className="mt-1 font-bold text-[var(--text-primary)]">{statusText[close.status] ?? close.status}</p></div><div><p className="text-xs text-[var(--text-muted)]">เงินสดขาด/เกิน</p><p className={`mt-1 font-bold ${cashDifference === 0 ? "text-emerald-600" : "text-amber-600"}`}>{cashDifference == null ? "ยังไม่มีข้อมูล" : cashDifference === 0 ? "ตรงยอด" : `${cashDifference > 0 ? "เกิน" : "ขาด"} ${money(Math.abs(cashDifference))}`}</p></div><div><p className="text-xs text-[var(--text-muted)]">เงินสดตามระบบ</p><p className="mt-1 font-bold text-[var(--text-primary)]">{money(close.expectedCash)}</p></div><div><p className="text-xs text-[var(--text-muted)]">เงินสดที่นับได้</p><p className="mt-1 font-bold text-[var(--text-primary)]">{close.countedCash == null ? "ยังไม่มีข้อมูล" : money(close.countedCash)}</p></div></div>}
        </Card></section>

        <section className="space-y-3"><SectionTitle icon={<PackageX size={20}/>} title="เรื่องที่ต้องจัดการวันนี้" description={tasksCount ? `พบ ${tasksCount} รายการจากข้อมูลสต็อกจริง` : "ไม่พบรายการที่เข้าเกณฑ์จากข้อมูลปัจจุบัน"}/><div className="grid gap-4 lg:grid-cols-3">
            <Card title={`วัตถุดิบหมด (${data.tasks.outOfStock.length})`}>{data.tasks.outOfStock.length ? <div className="space-y-2">{data.tasks.outOfStock.map(item => <Link key={item.id} href={`/admin/ingredients/${item.id}`} className="flex justify-between gap-3 rounded-lg p-2 hover:bg-[var(--accent)]/10"><span className="font-medium text-[var(--text-primary)]">{item.name}</span><span className="text-red-600">{item.stock} {item.unit}</span></Link>)}</div> : <Empty>ไม่มีวัตถุดิบที่สต็อกหมด</Empty>}</Card>
            <Card title={`ต่ำกว่า Min stock (${data.tasks.lowStock.length})`}>{data.tasks.lowStock.length ? <div className="space-y-2">{data.tasks.lowStock.map(item => <Link key={item.id} href={`/admin/ingredients/${item.id}`} className="block rounded-lg p-2 hover:bg-[var(--accent)]/10"><div className="flex justify-between gap-3"><span className="font-medium text-[var(--text-primary)]">{item.name}</span><span>{item.stock} {item.unit}</span></div><p className="mt-1 text-xs text-[var(--text-muted)]">ขั้นต่ำ {item.minStock} {item.unit}</p></Link>)}</div> : <Empty>ไม่มีวัตถุดิบต่ำกว่าขั้นต่ำ</Empty>}</Card>
            <Card title={`ล็อตใกล้หมดอายุ (${data.tasks.expiringLots.length})`}>{data.tasks.expiringLots.length ? <div className="space-y-2">{data.tasks.expiringLots.map(item => <Link key={item.id} href={`/admin/ingredients/${item.ingredientId}`} className="block rounded-lg p-2 hover:bg-[var(--accent)]/10"><div className="flex justify-between gap-3"><span className="font-medium text-[var(--text-primary)]">{item.ingredientName}</span><span className="text-amber-600">{item.daysToExpiry < 0 ? `เลย ${Math.abs(item.daysToExpiry)} วัน` : `อีก ${item.daysToExpiry} วัน`}</span></div><p className="mt-1 text-xs text-[var(--text-muted)]">ล็อต {item.lotCode ?? "-"} · {item.quantity} {item.unit ?? ""}</p></Link>)}</div> : <Empty>ไม่มีล็อตที่ใกล้หมดอายุจากข้อมูลที่บันทึกไว้</Empty>}</Card>
        </div></section>

        <section className="space-y-3"><SectionTitle icon={<AlertTriangle size={20}/>} title="เหตุการณ์ที่ควรตรวจจากเมื่อวาน" description={eventCount ? `พบ ${eventCount} เหตุการณ์ตามกฎที่กำหนด` : "ไม่พบ cancelled, void, refunded, adjust, waste หรือเงินสดต่างยอด"}/><Card>{eventCount === 0 ? <Empty>ไม่มีเหตุการณ์ที่เข้าเกณฑ์ให้ตรวจ</Empty> : <div className="divide-y divide-[var(--text-muted)]/15">
            {data.reviewEvents.orders.map(order => <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-[var(--accent)]"><span><b>{statusText[order.status] ?? order.status}</b> · ออเดอร์ #{order.id.slice(0, 8)}</span><span>{money(order.total)}</span></Link>)}
            {data.reviewEvents.stock.map(event => <Link key={event.id} href={`/admin/stock?ingredient_id=${event.ingredientId}`} className="flex items-center justify-between gap-3 py-3 hover:text-[var(--accent)]"><span><b>{event.type === "waste" ? "ของเสีย" : "ปรับสต็อก"}</b> · {event.ingredientName}{event.note ? ` · ${event.note}` : ""}</span><span>{event.amount.toLocaleString("th-TH")}</span></Link>)}
            {cashDifference != null && cashDifference !== 0 ? <Link href="/admin/daily-close" className="flex items-center justify-between gap-3 py-3 hover:text-[var(--accent)]"><span><b>เงินสดต่างยอด</b> · จากการปิดยอดเมื่อวาน</span><span>{cashDifference > 0 ? "เกิน" : "ขาด"} {money(Math.abs(cashDifference))}</span></Link> : null}
        </div>}</Card></section>

        <section className="space-y-3"><SectionTitle icon={<ReceiptText size={20}/>} title="สรุปยอดขายเมื่อวาน" description={`ยอดชำระแล้วในวันที่ ${data.dates.yesterday.date}`}/><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Card title="ยอดขายสุทธิ"><p className="text-2xl font-bold text-[var(--text-primary)]">{money(data.sales.netSales)}</p></Card><Card title="จำนวนออเดอร์"><p className="text-2xl font-bold text-[var(--text-primary)]">{data.sales.paidOrderCount.toLocaleString("th-TH")}</p></Card><Card title="เฉลี่ยต่อบิล"><p className="text-2xl font-bold text-[var(--text-primary)]">{money(data.sales.averageOrderValue)}</p></Card><Card title="วิธีชำระเงิน"><div className="space-y-2 text-sm"><p className="flex justify-between"><span className="inline-flex gap-2"><Banknote size={16}/>เงินสด</span><b>{money(data.sales.cashSales)}</b></p><p className="flex justify-between"><span>PromptPay</span><b>{money(data.sales.promptPaySales)}</b></p>{data.sales.otherSales > 0 ? <p className="flex justify-between text-[var(--text-muted)]"><span>วิธีอื่น/ไม่ระบุ</span><b>{money(data.sales.otherSales)}</b></p> : null}</div></Card></div></section>
    </div>;
}
