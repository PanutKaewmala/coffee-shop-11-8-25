"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Order, OrderItem } from "@/lib/types";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    /* -------------------- PAGINATION -------------------- */
    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState(String(1)); // controlled string input
    const rowsPerPage = 20;

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(orders.length / rowsPerPage));
    }, [orders.length]);

    // keep inputPage in sync when page changes programmatically
    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    const paginatedOrders = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        return orders.slice(start, end);
    }, [orders, page]);

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

    /* -------------------- TABLE HEADERS -------------------- */
    const headers = ["Order ID", "Items", "Total", "Date"];

    /* -------------------- TABLE ROWS -------------------- */
    const rows = paginatedOrders
        .slice()
        .sort(
            (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
        )
        .map((order) => {
            const count = Array.isArray(order.items)
                ? order.items.reduce((sum, i: OrderItem) => sum + i.qty, 0)
                : 0;

            return [
                <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="text-accent hover:underline font-mono"
                >
                    {order.id}
                </Link>,

                `${count} รายการ`,

                `${order.total} บาท`,

                new Date(order.created_at).toLocaleString("th-TH"),
            ];
        });

    /* -------------------- HANDLE PAGE CHANGE -------------------- */
    const nextPage = () => {
        if (page < totalPages) setPage((p) => {
            const np = p + 1;
            return np;
        });
    };

    const prevPage = () => {
        if (page > 1) setPage((p) => {
            const np = p - 1;
            return np;
        });
    };

    const commitInputPage = () => {
        // if input is empty, do nothing (stay on current page)
        if (inputPage.trim() === "") {
            setInputPage(String(page)); // reset UI to current page
            return;
        }

        const val = Number(inputPage);
        if (!Number.isFinite(val) || val < 1 || val > totalPages) {
            // invalid -> reset display to current page
            setInputPage(String(page));
            return;
        }

        // valid
        setPage(val);
    };

    return (
        <div className="p-6 space-y-6">
            <Card title="รายการออเดอร์ทั้งหมด">
                {loading ? (
                    <p className="p-4">Loading...</p>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="p-4 rounded-xl bg-card border border-border/40">
                                <div className="text-text-secondary">ยอดขายรวม</div>
                                <div className="text-3xl font-bold mt-1">
                                    {totalSales} บาท
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-card border border-border/40">
                                <div className="text-text-secondary">จำนวนออเดอร์</div>
                                <div className="text-3xl font-bold mt-1">
                                    {orders.length} รายการ
                                </div>
                            </div>
                        </div>

                        {/* Orders Table */}
                        <Table headers={headers} data={rows} />

                        {/* Pagination */}
                        <div className="flex flex-col md:flex-row items-center justify-center gap-3 mt-6">

                            {/* Page input */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="หน้า"
                                    value={inputPage}
                                    onChange={(e) => {
                                        // allow empty string or numeric characters only
                                        const v = e.target.value;
                                        if (v === "" || /^[0-9]*$/.test(v)) {
                                            setInputPage(v);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            commitInputPage();
                                        }
                                    }}
                                    onBlur={() => commitInputPage()}
                                    className="
                                        w-20 px-2 py-1 text-center rounded-lg 
                                        bg-card border border-border/40 
                                        focus:outline-none focus:ring-1 focus:ring-accent
                                    "
                                />
                            </div>

                            {/* Prev */}
                            <button
                                onClick={prevPage}
                                disabled={page === 1}
                                className="p-2 rounded-lg border border-border/40 hover:bg-border/10 disabled:opacity-30"
                            >
                                <ChevronLeft size={18} />
                            </button>

                            {/* Page indicator */}
                            <span className="text-sm text-text-secondary">
                                {page} / {totalPages}
                            </span>

                            {/* Next */}
                            <button
                                onClick={nextPage}
                                disabled={page === totalPages}
                                className="p-2 rounded-lg border border-border/40 hover:bg-border/10 disabled:opacity-30"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </>
                )}
            </Card>
        </div>
    );
}
