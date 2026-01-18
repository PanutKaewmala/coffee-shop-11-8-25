// app/admin/orders/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import type { OrderDetail, OrderItemRow } from "@/lib/types";

/* =========================
   Type guards + readers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null;
}

function readNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function parseOrderItemRow(v: unknown): OrderItemRow | null {
    if (!isRecord(v)) return null;

    const id = readString(v.id) ?? "";
    const order_id = readString(v.order_id) ?? "";
    const menu_id = readString(v.menu_id) ?? "";
    const name = readString(v.name) ?? "";
    const created_at = readString(v.created_at) ?? "";

    if (!id || !order_id || !menu_id || !name || !created_at) return null;

    // variant_id เป็น null ได้
    const variant_id =
        typeof v.variant_id === "string"
            ? v.variant_id
            : v.variant_id === null
                ? null
                : null;

    return {
        id,
        order_id,
        menu_id,
        variant_id,
        name,
        price: readNumber(v.price, 0),
        qty: readNumber(v.qty, 0),
        created_at,
    };
}

function parseOrderDetail(raw: unknown): OrderDetail | null {
    if (!isRecord(raw)) return null;

    const id = readString(raw.id) ?? "";
    const created_at = readString(raw.created_at) ?? "";
    if (!id || !created_at) return null;

    const total = readNumber(raw.total, 0);

    // รองรับ items หรือ order_items
    const rawItems =
        Array.isArray(raw.items) ? raw.items : Array.isArray(raw.order_items) ? raw.order_items : [];

    const items = rawItems
        .map(parseOrderItemRow)
        .filter((x): x is OrderItemRow => x !== null);

    return { id, total, created_at, items };
}

function extractOrderFromResponse(data: unknown): OrderDetail | null {
    // รองรับ: { order: {...} }
    if (isRecord(data) && "order" in data) {
        return parseOrderDetail((data as Record<string, unknown>).order);
    }

    // เผื่อบางที API ส่ง order ตรงๆ
    return parseOrderDetail(data);
}

/* =========================
   Component
========================= */
export default function OrderDetailPage() {
    const params = useParams();

    const orderId = useMemo(() => {
        const raw = (params as Record<string, string | string[] | undefined>)?.id;
        if (typeof raw === "string") return raw;
        if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
        return null;
    }, [params]);

    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        async function fetchOrder(id: string) {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`);
                const data: unknown = await res.json();

                const parsed = extractOrderFromResponse(data);
                if (!alive) return;

                setOrder(parsed);
                if (!parsed) setError("รูปแบบข้อมูลออเดอร์ไม่ถูกต้อง / ไม่พบออเดอร์");
            } catch (e: unknown) {
                if (!alive) return;
                const msg = e instanceof Error ? e.message : "โหลดข้อมูลออเดอร์ผิดพลาด";
                setError(msg);
                setOrder(null);
            } finally {
                if (alive) setLoading(false);
            }
        }

        if (orderId) fetchOrder(orderId);
        else {
            setLoading(false);
            setOrder(null);
            setError("ไม่มี Order ID");
        }

        return () => {
            alive = false;
        };
    }, [orderId]);

    if (loading) return <div className="p-6">กำลังโหลด...</div>;

    if (!order) {
        return (
            <div className="p-6 space-y-3">
                <Link
                    href="/admin/orders"
                    className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition"
                >
                    <ArrowLeft size={18} />
                    กลับไปหน้า Orders
                </Link>

                <div className="text-text-secondary">{error ?? "ไม่พบข้อมูลออเดอร์"}</div>
            </div>
        );
    }

    const itemHeaders = ["สินค้า", "จำนวน", "ราคา"];

    const itemRows = order.items.map((item) => {
        const lineTotal = item.price * item.qty;
        return [item.name, String(item.qty), `${lineTotal} บาท`];
    });

    return (
        <div className="p-6 space-y-6 text-text-primary">
            <Link
                href="/admin/orders"
                className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition mb-4"
            >
                <ArrowLeft size={18} />
                กลับไปหน้า Orders
            </Link>

            <Card title="รายละเอียดออเดอร์">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                    <div>
                        <p className="text-text-secondary mb-1">Order ID</p>
                        <p className="font-mono break-all">{order.id}</p>
                    </div>

                    <div>
                        <p className="text-text-secondary mb-1">วันที่</p>
                        <p>{new Date(order.created_at).toLocaleString("th-TH")}</p>
                    </div>

                    <div>
                        <p className="text-text-secondary mb-1">ยอดรวม</p>
                        <p className="text-xl font-bold">{order.total} บาท</p>
                    </div>

                    <div>
                        <p className="text-text-secondary mb-1">จำนวนรายการ</p>
                        <p className="text-xl font-bold">{order.items.length}</p>
                    </div>
                </div>
            </Card>

            <Card title="รายการสินค้า">
                {order.items.length === 0 ? (
                    <div className="p-6 text-center text-text-secondary">ไม่มีสินค้าในออเดอร์นี้</div>
                ) : (
                    <Table headers={itemHeaders} data={itemRows} />
                )}
            </Card>
        </div>
    );
}
