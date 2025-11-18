"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import { OrderDetail, OrderItem } from "@/lib/types";

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

    /* -------------------------------------
     * Table Data
     * ----------------------------------- */
    const itemHeaders = ["สินค้า", "จำนวน", "ราคา"];

    const itemRows =
        order.items.length === 0
            ? []
            : order.items.map((item: OrderItem) => [
                item.name,
                item.qty,
                `${item.price * item.qty} บาท`,
            ]);

    return (
        <div className="p-6 space-y-6 text-text-primary">
            {/* กลับไป Orders */}
            <Link
                href="/admin/orders"
                className="
                    inline-flex items-center gap-2 
                    text-text-secondary hover:text-text-primary
                    transition mb-4
                "
            >
                <ArrowLeft size={18} />
                กลับไปหน้า Orders
            </Link>

            {/* Order Summary */}
            <Card title="รายละเอียดออเดอร์">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                    <div>
                        <p className="text-text-secondary mb-1">Order ID</p>
                        <p className="font-mono">{order.id}</p>
                    </div>

                    <div>
                        <p className="text-text-secondary mb-1">วันที่</p>
                        <p>{new Date(order.created_at).toLocaleString("th-TH")}</p>
                    </div>

                    <div>
                        <p className="text-text-secondary mb-1">ยอดรวม</p>
                        <p className="text-xl font-bold">{order.total} บาท</p>
                    </div>
                </div>
            </Card>

            {/* Items */}
            <Card title="รายการสินค้า">
                {order.items.length === 0 ? (
                    <div className="p-6 text-center text-text-secondary">
                        ไม่มีสินค้าในออเดอร์นี้
                    </div>
                ) : (
                    <Table headers={itemHeaders} data={itemRows} />
                )}
            </Card>
        </div>
    );
}
