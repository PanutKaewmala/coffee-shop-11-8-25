"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Order, OrderItem } from "@/lib/types";
import Card from "@/components/admin/Card";

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    /* -------------------- LOAD ORDERS -------------------- */
    useEffect(() => {
        async function fetchOrders() {
            try {
                const res = await fetch("/api/orders");
                const data = await res.json();
                setOrders(Array.isArray(data.orders) ? data.orders : []);
            } catch (err) {
                console.error("โหลดออเดอร์ผิดพลาด:", err);
            }
            setLoading(false);
        }

        fetchOrders();
    }, []);

    /* -------------------- TOTAL SALES -------------------- */
    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    return (
        <div className="p-6 space-y-6">
            {/* ใช้ Card แบบเดียวกับหน้าอื่น */}
            <Card title="รายการออเดอร์ทั้งหมด">

                {loading ? (
                    <p className="p-4">Loading...</p>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            <div className="p-4 rounded-xl bg-surface border border-[var(--text-muted)]/20">
                                <div className="text-lg text-text-secondary">ยอดขายรวม</div>
                                <div className="text-3xl font-bold mt-1">{totalSales} บาท</div>
                            </div>

                            <div className="p-4 rounded-xl bg-surface border border-[var(--text-muted)]/20">
                                <div className="text-lg text-text-secondary">จำนวนออเดอร์</div>
                                <div className="text-3xl font-bold mt-1">{orders.length} รายการ</div>
                            </div>
                        </div>

                        {/* Orders Table */}
                        <div className="rounded-xl overflow-hidden border border-[var(--text-muted)]/20 bg-surface">
                            <table className="w-full text-left">
                                <thead className="bg-accent/10 text-text-primary">
                                    <tr>
                                        <th className="p-4">Order ID</th>
                                        <th className="p-4">จำนวนสินค้า</th>
                                        <th className="p-4">ยอดรวม</th>
                                        <th className="p-4">วันที่</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {orders.length === 0 ? (
                                        <tr>
                                            <td
                                                className="p-4 text-center text-text-secondary"
                                                colSpan={4}
                                            >
                                                ยังไม่มีออเดอร์
                                            </td>
                                        </tr>
                                    ) : (
                                        orders
                                            .slice()
                                            .sort(
                                                (a, b) =>
                                                    new Date(b.created_at).getTime() -
                                                    new Date(a.created_at).getTime()
                                            )
                                            .map((order) => {
                                                const totalItems = Array.isArray(order.items)
                                                    ? order.items.reduce(
                                                        (sum: number, i: OrderItem) => sum + i.qty,
                                                        0
                                                    )
                                                    : 0;

                                                return (
                                                    <tr
                                                        key={order.id}
                                                        className="border-t border-[var(--text-muted)]/20 hover:bg-accent/10 transition"
                                                    >
                                                        <td className="p-0" colSpan={4}>
                                                            <Link
                                                                href={`/admin/orders/${order.id}`}
                                                                className="flex w-full p-4 items-center hover:bg-accent/10 transition cursor-pointer"
                                                            >
                                                                <div className="w-1/4 font-mono text-text-primary">
                                                                    {order.id}
                                                                </div>

                                                                <div className="w-1/4">
                                                                    {totalItems} รายการ
                                                                </div>

                                                                <div className="w-1/4 font-bold">
                                                                    {order.total} บาท
                                                                </div>

                                                                <div className="w-1/4">
                                                                    {new Date(order.created_at).toLocaleString(
                                                                        "th-TH"
                                                                    )}
                                                                </div>
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}

