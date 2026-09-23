"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/admin/Card";
import { parseUsableStock, stockStatus, stockStatusLabel, unavailableStockLabel, validMinimum, type UsableStock, type UsableStockItem } from "@/lib/usableStock";

const formatQuantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 6 });
const buttonClass = "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface)] disabled:opacity-50";
const tones = {
    normal: "bg-green-100 text-green-800",
    low: "bg-amber-100 text-amber-900",
    out: "bg-red-100 text-red-800",
    unavailable: "bg-gray-500/10 text-[var(--text-secondary)]",
};

function MinimumEditor({ item, stock, onSaved }: { item: UsableStockItem; stock: UsableStock; onSaved: () => void }) {
    const [value, setValue] = useState(item.minimum_stock === null ? "" : String(item.minimum_stock));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (saving) return;
        if (!validMinimum(value)) { setError("กรอกเลข 0 ขึ้นไป ทศนิยมไม่เกิน 6 ตำแหน่ง"); return; }
        setSaving(true); setError(null);
        try {
            const response = await fetch("/api/stock/usable", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shop_id: stock.shop_id, branch_id: stock.branch_id, source_type: item.source_type, item_id: item.id, minimum_stock: value }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.ok !== true) throw new Error(result?.error ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่");
            onSaved();
        } catch (reason) { setError(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ"); }
        finally { setSaving(false); }
    }
    return <form onSubmit={save} className="space-y-2">
        <label className="block text-sm" htmlFor={`minimum-${item.source_type}-${item.id}`}>ขั้นต่ำ ({item.unit})</label>
        <div className="flex flex-wrap gap-2">
            <input id={`minimum-${item.source_type}-${item.id}`} aria-label={`ขั้นต่ำ ${item.name}`} inputMode="decimal" value={value} disabled={saving}
                onChange={(event) => setValue(event.target.value)} placeholder="ยังไม่ตั้งขั้นต่ำ"
                className="min-w-0 w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)]" />
            <button type="submit" disabled={saving} className={buttonClass}>{saving ? "กำลังบันทึก…" : "บันทึกขั้นต่ำ"}</button>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
    </form>;
}

export default function UsableStockPanel() {
    const [stock, setStock] = useState<UsableStock | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    const refresh = () => { setLoading(true); setError(null); setStock(null); setRevision((value) => value + 1); };
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/stock/usable", { cache: "no-store", signal: controller.signal }).then(async (response) => {
            const body: unknown = await response.json().catch(() => null);
            if (!response.ok) throw new Error("ไม่สามารถโหลดสต็อกพร้อมใช้ได้ กรุณาลองใหม่");
            const next = parseUsableStock(body);
            if (!controller.signal.aborted) setStock(next);
        }).catch((reason: unknown) => {
            if (!controller.signal.aborted) { setStock(null); setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ"); }
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [revision]);

    const items = stock ? [...stock.items].sort((a, b) => {
        const rank = { out: 0, low: 1, unavailable: 2, normal: 3 };
        return rank[stockStatus(a)] - rank[stockStatus(b)] || a.name.localeCompare(b.name);
    }) : [];
    return <div className="space-y-5 p-4 md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div><h1 className="text-2xl font-bold text-[var(--text-primary)]">สต็อกพร้อมใช้</h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">วัตถุดิบที่ใช้ในสูตรของสาขา{stock ? ` · ${stock.branch_name}` : "ที่เลือก"}</p></div>
            <button type="button" onClick={() => { setNotice(null); refresh(); }} disabled={loading} className={buttonClass}>รีเฟรชยอด</button>
        </header>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">ยอดที่ระบบบันทึกไว้ ไม่ใช่ยอดที่ตรวจนับจริง · นับเฉพาะสต็อกที่พร้อมใช้ ไม่รวมล็อตหมดอายุ ถูกเรียกคืน ไม่ผ่านการตรวจสอบ หรืออยู่ในพื้นที่ที่ใช้ขายไม่ได้</p>
        {notice ? <p role="status" className="text-sm text-[var(--accent)]">{notice}</p> : null}
        {loading ? <Card><p role="status">กำลังโหลดสต็อกพร้อมใช้…</p></Card> : error ? <Card><div role="alert"><p className="font-semibold text-red-600 dark:text-red-300">{error}</p><p className="mt-2 text-sm">ยังไม่สามารถสรุปได้ว่าสต็อกปกติหรือขาด กรุณารีเฟรชยอด</p></div></Card> : stock ? <>
            <p className="text-sm text-[var(--text-muted)]">ข้อมูล ณ {new Date(stock.as_of).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} (เวลาไทย) · รีเฟรชหลังรับของ ขาย หรือยกเลิกคืนสต็อก</p>
            {items.length === 0 ? <Card><p>ยังไม่มีวัตถุดิบที่ใช้ในสูตรของสาขานี้</p><p className="mt-2 text-sm text-[var(--text-muted)]">จึงยังไม่มีรายการสำหรับประเมินการขาดสต็อก</p></Card> : <div className="grid gap-4 lg:grid-cols-2">
                {items.map((item) => {
                    const status = stockStatus(item);
                    return <Card key={`${stock.as_of}:${item.source_type}:${item.id}`}>
                        <article aria-label={item.name} className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-bold text-lg">{item.name}</h2>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[status]}`}>{stockStatusLabel[status]}</span></div>
                            <div><p className="text-sm text-[var(--text-muted)]">จำนวนพร้อมใช้ · {item.source_type === "supply_item" ? "คลัง TALVO" : "วัตถุดิบเดิม"}</p>
                                <p className="mt-1 text-2xl font-bold">{item.usable_stock === null ? "—" : formatQuantity(item.usable_stock)} <span className="text-base font-normal">{item.unit}</span></p></div>
                            {status === "unavailable" ? <p className="text-sm text-[var(--text-secondary)]">{unavailableStockLabel(item.unavailable_reason)}</p> : null}
                            <p className="text-sm">{item.minimum_stock === null ? "ยังไม่ตั้งขั้นต่ำ · ยังไม่ประเมินใกล้หมด (Low Stock)" : `ขั้นต่ำ ${formatQuantity(item.minimum_stock)} ${item.unit} · ใกล้หมดเมื่อยอดมากกว่า 0 และไม่เกินขั้นต่ำ`}</p>
                            {stock.can_edit_minimum ? <MinimumEditor item={item} stock={stock} onSaved={() => { setNotice(`บันทึกขั้นต่ำ ${item.name} แล้ว`); refresh(); }} /> : null}
                        </article>
                    </Card>;
                })}
            </div>}
        </> : null}
        <Link href="/admin/stock" className="inline-block text-sm text-[var(--accent)] hover:underline">กลับหน้าสต็อก</Link>
    </div>;
}
