"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/admin/Card";
import { parseUsableStock, stockStatus, stockStatusLabel, unavailableStockLabel, validMinimum, type UsableStock, type UsableStockItem } from "@/lib/usableStock";

const formatQuantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 6 });
const buttonClass = "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface)] disabled:opacity-50";
const inputClass = "min-w-0 w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)]";
const tones = {
    normal: "bg-green-100 text-green-800",
    low: "bg-amber-100 text-amber-900",
    out: "bg-red-100 text-red-800",
    unavailable: "bg-gray-500/10 text-[var(--text-secondary)]",
};

function ReceiveStockForm({ item, stock, onSaved }: { item: UsableStockItem; stock: UsableStock; onSaved: (quantity: string) => void }) {
    const [quantity, setQuantity] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function receive(event: React.FormEvent) {
        event.preventDefault();
        if (saving) return;
        if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(quantity) || Number(quantity) <= 0) {
            setError("กรอกจำนวนมากกว่า 0 ทศนิยมไม่เกิน 6 ตำแหน่ง");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const response = await fetch("/api/stock/usable", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": `receive:${item.id}:${crypto.randomUUID()}`,
                },
                body: JSON.stringify({
                    shop_id: stock.shop_id,
                    branch_id: stock.branch_id,
                    source_type: item.source_type,
                    item_id: item.id,
                    quantity,
                }),
            });
            const result: unknown = await response.json().catch(() => null);
            const message =
                result && typeof result === "object" && !Array.isArray(result) && "error" in result && typeof result.error === "string"
                    ? result.error
                    : "รับของเข้าไม่สำเร็จ กรุณาลองใหม่";
            if (!response.ok) throw new Error(message);
            onSaved(quantity);
            setQuantity("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "รับของเข้าไม่สำเร็จ กรุณาลองใหม่");
        } finally {
            setSaving(false);
        }
    }

    return <form onSubmit={receive} className="space-y-2 border-t border-[var(--border)] pt-4">
        <label className="block text-sm font-semibold" htmlFor={`receive-${item.id}`}>รับของเข้า ({item.unit})</label>
        <div className="flex flex-wrap gap-2">
            <input
                id={`receive-${item.id}`}
                aria-label={`รับเข้า ${item.name}`}
                inputMode="decimal"
                value={quantity}
                disabled={saving}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="เช่น 100"
                className={inputClass}
            />
            <button type="submit" disabled={saving || quantity.trim() === ""} className={buttonClass}>
                {saving ? "กำลังรับเข้า…" : "รับเข้า"}
            </button>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
    </form>;
}

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
        <label className="block text-sm" htmlFor={`minimum-${item.source_type}-${item.id}`}>เตือนเมื่อเหลือไม่เกิน ({item.unit})</label>
        <div className="flex flex-wrap gap-2">
            <input id={`minimum-${item.source_type}-${item.id}`} aria-label={`จุดเตือน ${item.name}`} inputMode="decimal" value={value} disabled={saving}
                onChange={(event) => setValue(event.target.value)} placeholder="ยังไม่ได้ตั้ง"
                className={inputClass} />
            <button type="submit" disabled={saving} className={buttonClass}>{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
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
            <div><h1 className="text-2xl font-bold text-[var(--text-primary)]">สต็อกที่พร้อมใช้</h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">วัตถุดิบที่สูตรของสาขานี้ใช้อยู่{stock ? ` · ${stock.branch_name}` : "ที่เลือก"}</p></div>
            <button type="button" onClick={() => { setNotice(null); refresh(); }} disabled={loading} className={buttonClass}>อัปเดตยอด</button>
        </header>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">ยอดนี้มาจากรายการรับเข้า ขาย และคืนสต็อกในระบบ ไม่ใช่ยอดจากการนับของจริง · ไม่นับล็อตหมดอายุ ถูกเรียกคืน ยังไม่ผ่านการตรวจ หรือของที่ถูกแยกไว้ไม่ให้ขาย</p>
        {notice ? <p role="status" className="text-sm text-[var(--accent)]">{notice}</p> : null}
        {loading ? <Card><p role="status">กำลังโหลดสต็อก…</p></Card> : error ? <Card><div role="alert"><p className="font-semibold text-red-600 dark:text-red-300">{error}</p><p className="mt-2 text-sm">ตอนนี้ยังบอกไม่ได้ว่าสต็อกพอหรือไม่ ลองอัปเดตข้อมูลอีกครั้ง</p></div></Card> : stock ? <>
            <p className="text-sm text-[var(--text-muted)]">อัปเดตล่าสุด {new Date(stock.as_of).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} (เวลาไทย) · ยอดจะเปลี่ยนหลังรับของ ขาย หรือยกเลิกแล้วคืนสต็อก</p>
            {items.length === 0 ? <Card><p>ยังไม่มีวัตถุดิบที่ใช้ในสูตรของสาขานี้</p><p className="mt-2 text-sm text-[var(--text-muted)]">เลยยังไม่มีรายการให้เช็กว่าอะไรใกล้หมด</p></Card> : <div className="grid gap-4 lg:grid-cols-2">
                {items.map((item) => {
                    const status = stockStatus(item);
                    return <Card key={`${stock.as_of}:${item.source_type}:${item.id}`}>
                        <article aria-label={item.name} className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-bold text-lg">{item.name}</h2>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[status]}`}>{stockStatusLabel[status]}</span></div>
                            <div><p className="text-sm text-[var(--text-muted)]">จำนวนที่ใช้ขายได้ตอนนี้ · {item.source_type === "supply_item" ? "คลังวัตถุดิบ" : "วัตถุดิบเดิม"}</p>
                                <p className="mt-1 text-2xl font-bold">{item.usable_stock === null ? "—" : formatQuantity(item.usable_stock)} <span className="text-base font-normal">{item.unit}</span></p></div>
                            {status === "unavailable" ? <p className="text-sm text-[var(--text-secondary)]">{unavailableStockLabel(item.unavailable_reason)}</p> : null}
                            <p className="text-sm">{item.minimum_stock === null ? "ยังไม่ได้ตั้งจุดเตือนของใกล้หมด" : `ตั้งจุดเตือนไว้ที่ ${formatQuantity(item.minimum_stock)} ${item.unit} · ระบบใช้ค่านี้ช่วยบอกว่าเมื่อไรควรเติมของ`}</p>
                            {stock.can_edit_minimum && item.source_type === "supply_item"
                                ? <ReceiveStockForm item={item} stock={stock} onSaved={(quantity) => { setNotice(`รับเข้า ${item.name} ${quantity} ${item.unit} แล้ว`); refresh(); }} />
                                : null}
                            {stock.can_edit_minimum ? <MinimumEditor item={item} stock={stock} onSaved={() => { setNotice(`บันทึกจุดเตือนของ ${item.name} แล้ว`); refresh(); }} /> : null}
                        </article>
                    </Card>;
                })}
            </div>}
        </> : null}
        <Link href="/admin/stock" className="inline-block text-sm text-[var(--accent)] hover:underline">กลับไปดูความเคลื่อนไหวสต็อก</Link>
    </div>;
}
