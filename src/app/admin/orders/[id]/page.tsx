// app/admin/orders/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Copy, Check } from "lucide-react";

import Card from "@/components/admin/Card";
import type { OrderDetail } from "@/lib/types";

/* =========================
   Type guards + readers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function readString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}
function readNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/* =========================
   Local UI types
========================= */
type UIOrderItem = {
    id: string;
    name: string;
    price: number;
    qty: number;
    variant_label: string | null;
};
type UIOrderDetail = {
    id: string;
    total: number;
    created_at: string;
    items: UIOrderItem[];
    status?: OrderDetail["status"];
    payment_method?: OrderDetail["payment_method"];
    paid_at?: string | null;
    note?: string | null;
};

function parseUIOrderItem(v: unknown): UIOrderItem | null {
    if (!isRecord(v)) return null;

    const id = readString(v.id) ?? "";
    const name = readString(v.name) ?? "";
    if (!id || !name) return null;

    const price = readNumber(v.price, 0);
    const qty = readNumber(v.qty, 0);

    const variant_label =
        typeof v.variant_label === "string"
            ? v.variant_label
            : typeof v.variant_name === "string"
                ? v.variant_name
                : null;

    return { id, name, price, qty, variant_label };
}

function parseUIOrderDetail(raw: unknown): UIOrderDetail | null {
    if (!isRecord(raw)) return null;

    const id = readString(raw.id) ?? "";
    const created_at = readString(raw.created_at) ?? "";
    if (!id || !created_at) return null;

    const total = readNumber(raw.total, 0);
    const status = readString(raw.status) ?? undefined;
    const payment_method = readString(raw.payment_method) ?? undefined;
    const paid_at = readString(raw.paid_at) ?? null;
    const note = readString(raw.note) ?? null;

    const rawItems = Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.order_items)
            ? raw.order_items
            : [];

    const items = rawItems.map(parseUIOrderItem).filter((x): x is UIOrderItem => x !== null);

    return {
        id,
        total,
        created_at,
        items,
        status: status as OrderDetail["status"],
        payment_method: payment_method as OrderDetail["payment_method"],
        paid_at,
        note,
    };
}

function extractOrderFromResponse(data: unknown): UIOrderDetail | null {
    if (isRecord(data) && "order" in data) {
        const orderRaw = (data as Record<string, unknown>).order;
        return parseUIOrderDetail(orderRaw);
    }
    return parseUIOrderDetail(data);
}

/* =========================
   UI helpers
========================= */
function shortId(id: string, head = 6, tail = 6) {
    if (!id) return "-";
    if (id.length <= head + tail + 3) return id;
    return `${id.slice(0, head)}...${id.slice(-tail)}`;
}
function fmtMoney(v: number) {
    const n = Number.isFinite(v) ? v : 0;
    return n.toLocaleString("th-TH");
}
function fmtDateTH(iso: string) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}
function cleanVariant(v: string | null) {
    const s = (v ?? "").trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (low === "default" || s === "-" || low === "none") return null;
    return s;
}

function useOrderId(): string | null {
    const params = useParams();
    return useMemo(() => {
        const raw = (params as Record<string, string | string[] | undefined>)?.id;
        if (typeof raw === "string") return raw;
        if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
        return null;
    }, [params]);
}

/* =========================
   UI parts
========================= */
function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-text-secondary">
            {children}
        </span>
    );
}

function ReceiptRow({
    name,
    variant,
    qty,
    price,
}: {
    name: string;
    variant: string | null;
    qty: number;
    price: number;
}) {
    const lineTotal = price * qty;

    return (
        <div className="flex items-start justify-between gap-4 py-3 px-2 rounded-lg hover:bg-white/5 transition">
            <div className="min-w-0">
                <div className="font-medium leading-tight truncate">{name}</div>
                {variant ? <div className="text-xs opacity-60 mt-1 truncate">{variant}</div> : null}
            </div>

            <div className="shrink-0 text-right tabular-nums">
                <div className="text-sm font-semibold">{fmtMoney(lineTotal)}</div>
                <div className="text-xs opacity-60 mt-0.5">
                    {qty} × {fmtMoney(price)}
                </div>
            </div>
        </div>
    );
}

/* =========================
   Page
========================= */
export default function OrderDetailPage() {
    const orderId = useOrderId();

    const [order, setOrder] = useState<UIOrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);

    const clearCopyTimer = useCallback(() => {
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        async function run(id: string) {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`, {
                    signal: controller.signal,
                });
                const data: unknown = await res.json();
                const parsed = extractOrderFromResponse(data);

                setOrder(parsed);
                if (!parsed) setError("ไม่พบออเดอร์ / รูปแบบข้อมูลไม่ถูกต้อง");
            } catch (e: unknown) {
                if (controller.signal.aborted) return;
                setOrder(null);
                setError(e instanceof Error ? e.message : "โหลดข้อมูลออเดอร์ผิดพลาด");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        if (!orderId) {
            setLoading(false);
            setOrder(null);
            setError("ไม่มี Order ID");
            return () => controller.abort();
        }

        void run(orderId);
        return () => controller.abort();
    }, [orderId]);

    useEffect(() => () => clearCopyTimer(), [clearCopyTimer]);

    const qtyTotal = useMemo(() => {
        if (!order) return 0;
        return order.items.reduce((sum, it) => sum + (Number.isFinite(it.qty) ? it.qty : 0), 0);
    }, [order]);

    const itemsCount = order?.items.length ?? 0;

    const onCopy = useCallback(
        async (id: string) => {
            try {
                await navigator.clipboard.writeText(id);
                setCopied(true);
                clearCopyTimer();
                copyTimerRef.current = window.setTimeout(() => setCopied(false), 900);
            } catch {
                // ignore
            }
        },
        [clearCopyTimer]
    );

    if (loading) {
        return (
            <div className="p-6 space-y-4 text-text-primary">
                <div className="h-5 w-44 rounded bg-white/5 animate-pulse" />
                <div className="h-40 rounded-2xl bg-white/5 animate-pulse" />
                <div className="h-80 rounded-2xl bg-white/5 animate-pulse" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 space-y-4 text-text-primary">
                <Link
                    href="/admin/orders"
                    className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition"
                >
                    <ArrowLeft size={18} />
                    กลับไปหน้า Orders
                </Link>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-text-secondary">
                    {error ?? "ไม่พบข้อมูลออเดอร์"}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 text-text-primary">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/admin/orders"
                    className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition"
                >
                    <ArrowLeft size={18} />
                    กลับไปหน้า Orders
                </Link>

                <button
                    type="button"
                    onClick={() => onCopy(order.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-secondary hover:bg-white/10 transition"
                    title="คัดลอก Order ID"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span className="font-mono">{shortId(order.id)}</span>
                </button>
            </div>

            {/* Summary */}
            <Card title="สรุปออเดอร์">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs text-text-secondary opacity-70">{fmtDateTH(order.created_at)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Pill>{itemsCount} รายการ</Pill>
                            <Pill>{qtyTotal} ชิ้น</Pill>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-xs text-text-secondary opacity-70">ยอดรวม</div>
                        <div className="text-3xl font-extrabold tabular-nums leading-tight">
                            {fmtMoney(order.total)}{" "}
                            <span className="text-base font-semibold opacity-80">บาท</span>
                        </div>
                    </div>
                </div>

                {order.note ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-secondary opacity-70">หมายเหตุ</div>
                        <div className="text-sm mt-1">{order.note}</div>
                    </div>
                ) : null}
            </Card>

            {/* Items */}
            <Card title="รายการสินค้า">
                {order.items.length === 0 ? (
                    <div className="p-6 text-center text-text-secondary">ไม่มีสินค้าในออเดอร์นี้</div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {order.items.map((it) => (
                            <ReceiptRow
                                key={it.id}
                                name={it.name}
                                variant={cleanVariant(it.variant_label)}
                                qty={Number.isFinite(it.qty) ? it.qty : 0}
                                price={Number.isFinite(it.price) ? it.price : 0}
                            />
                        ))}
                    </div>
                )}

                {/* Bottom summary bar */}
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                    <div className="text-sm text-text-secondary">
                        รวม <span className="text-text-primary font-semibold">{qtyTotal}</span> ชิ้น
                    </div>
                    <div className="text-lg font-bold tabular-nums">{fmtMoney(order.total)} บาท</div>
                </div>
            </Card>
        </div>
    );
}
