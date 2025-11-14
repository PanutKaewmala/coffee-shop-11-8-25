"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OrderDetail, OrderItem } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export default function OrderDetailPage() {
    const { id } = useParams();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchOrder() {
            try {
                const res = await fetch(`/api/orders?id=${id}`);
                const data = await res.json();

                const fixed = data.order
                    ? {
                        ...data.order,
                        items: data.order.items ?? data.order.order_items ?? [],
                    }
                    : null;

                setOrder(fixed);
            } catch (err) {
                console.error("โหลดข้อมูลออเดอร์ผิดพลาด:", err);
            }
            setLoading(false);
        }

        if (id) fetchOrder();
    }, [id]);

    if (loading) return <div className="p-6">กำลังโหลด...</div>;
    if (!order) return <div className="p-6">ไม่พบข้อมูลออเดอร์</div>;

    return (
        <div className="p-6 text-text-primary">
            {/* 🔙 กลับไปหน้า Orders */}
            <Link
                href="/admin/orders"
                className="
                    inline-flex items-center gap-2 mb-6 
                    text-[var(--text-secondary)]
                    hover:text-[var(--text-primary)]
                    transition
                "
            >
                <ArrowLeft size={18} />
                กลับไปหน้า Orders
            </Link>

            <h1 className="text-3xl font-bold mb-6">รายละเอียดออเดอร์</h1>

            {/* Order Summary */}
            <div className="mb-6 p-4 rounded-xl bg-surface border border-[var(--text-muted)]/20">
                <div className="text-text-secondary">Order ID</div>
                <div className="font-mono text-lg">{order.id}</div>

                <div className="mt-3 text-text-secondary">วันที่</div>
                <div>{new Date(order.created_at).toLocaleString("th-TH")}</div>

                <div className="mt-3 text-text-secondary">ยอดรวม</div>
                <div className="text-2xl font-bold">{order.total} บาท</div>
            </div>

            {/* Items Table */}
            <h2 className="text-xl font-bold mb-3">รายการสินค้า</h2>

            <div className="rounded-xl overflow-hidden border border-[var(--text-muted)]/20 bg-surface">
                <table className="w-full text-left">
                    <thead className="bg-accent/10">
                        <tr>
                            <th className="p-4">สินค้า</th>
                            <th className="p-4">จำนวน</th>
                            <th className="p-4">ราคา</th>
                        </tr>
                    </thead>

                    <tbody>
                        {order.items.length === 0 ? (
                            <tr>
                                <td
                                    className="p-4 text-center text-text-secondary"
                                    colSpan={3}
                                >
                                    ไม่มีสินค้าในออเดอร์นี้
                                </td>
                            </tr>
                        ) : (
                            order.items.map((item: OrderItem) => (
                                <tr
                                    key={item.id}
                                    className="border-t border-[var(--text-muted)]/20"
                                >
                                    <td className="p-4">{item.name}</td>
                                    <td className="p-4">{item.qty}</td>
                                    <td className="p-4">
                                        {item.price * item.qty} บาท
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
