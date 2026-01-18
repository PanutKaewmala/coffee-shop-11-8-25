// app/admin/orders/page.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Pagination from "@/components/admin/Pagination";
import OrderItemsTooltip from "@/components/admin/OrderItemsTooltip";
import SearchBox from "@/components/admin/search/SearchBox";
import QuickDateFilter from "@/components/admin/QuickDateFilter";
import useOrdersSearch from "@/hooks/useOrdersSearch";

import type { OrderItem } from "@/lib/types";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";

type OrderRow = {
    id: string;
    total: number;
    created_at: string;
    items?: OrderItem[];
};

function formatMoneyTHB(n: number) {
    return new Intl.NumberFormat("th-TH").format(n);
}

function safeDateTH(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}

function shortId(id: string) {
    return id?.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export default function AdminOrdersPage() {
    const {
        loading,
        search,
        setSearch,
        dateFilter,
        setDateFilter,
        filteredOrders,
        paginatedOrders,
        totalSales,
        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,
    } = useOrdersSearch({ rowsPerPage: 20, initialFilter: "today" });

    const paidCount = filteredOrders.length; // ตอนนี้ถือว่า paid-only
    const avgOrder = useMemo(() => {
        if (paidCount <= 0) return 0;
        return totalSales / paidCount;
    }, [totalSales, paidCount]);

    const headers = ["#", "Order ID", "Items", "Total", "Date"];

    const rows = useMemo(() => {
        const list = paginatedOrders as unknown as OrderRow[];

        return list.map((order, idx) => {
            const items = Array.isArray(order.items) ? order.items : [];

            return [
                <span key={`idx-${order.id}`} className="text-text-secondary">
                    {(page - 1) * 20 + (idx + 1)}
                </span>,

                <Link
                    key={`id-${order.id}`}
                    href={`/admin/orders/${order.id}`}
                    className="text-accent hover:underline font-mono"
                    title={order.id}
                >
                    {shortId(order.id)}
                </Link>,

                <OrderItemsTooltip key={`items-${order.id}`} items={items} />,

                <span key={`total-${order.id}`} className="tabular-nums text-right block">
                    {formatMoneyTHB(order.total)} บาท
                </span>,

                <span key={`date-${order.id}`} className="text-text-secondary">
                    {safeDateTH(order.created_at)}
                </span>,
            ];
        });
    }, [paginatedOrders, page]);

    const isEmpty = !loading && filteredOrders.length === 0;
    const showReset = search.trim().length > 0 || dateFilter !== "today";

    return (
        <div className="p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <Card title="รายการออเดอร์ทั้งหมด">
                    {/* FILTER + SEARCH */}
                    <div className="space-y-3">
                        <QuickDateFilter
                            dateFilter={dateFilter as DateFilter}
                            setDateFilter={(v) => {
                                setDateFilter(v as DateFilter);
                                setPage(1);
                                setInputPage("1");
                            }}
                        />

                        <div className="flex items-center justify-between gap-3">
                            <div className="flex-1">
                                <SearchBox
                                    value={search}
                                    setValue={(v) => {
                                        setSearch(v);
                                        setPage(1);
                                        setInputPage("1");
                                    }}
                                    placeholder="ค้นหา Order ID / วันที่ / เวลา"
                                />
                            </div>

                            {showReset && (
                                <button
                                    type="button"
                                    className="text-sm text-accent hover:underline whitespace-nowrap"
                                    onClick={() => {
                                        setSearch("");
                                        setDateFilter("today" as DateFilter);
                                        setPage(1);
                                        setInputPage("1");
                                    }}
                                >
                                    รีเซ็ต
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="mt-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 rounded-xl bg-card border border-border/40 animate-pulse">
                                    <div className="h-4 w-28 bg-border/40 rounded" />
                                    <div className="h-8 w-44 bg-border/40 rounded mt-3" />
                                </div>
                                <div className="p-4 rounded-xl bg-card border border-border/40 animate-pulse">
                                    <div className="h-4 w-28 bg-border/40 rounded" />
                                    <div className="h-8 w-28 bg-border/40 rounded mt-3" />
                                </div>
                                <div className="p-4 rounded-xl bg-card border border-border/40 animate-pulse">
                                    <div className="h-4 w-24 bg-border/40 rounded" />
                                    <div className="h-8 w-36 bg-border/40 rounded mt-3" />
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-card border border-border/40 animate-pulse">
                                <div className="h-10 w-full bg-border/30 rounded" />
                                <div className="h-10 w-full bg-border/20 rounded mt-3" />
                                <div className="h-10 w-full bg-border/10 rounded mt-3" />
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* SUMMARY */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 mb-6">
                                <div className="p-4 rounded-xl bg-card border border-border/40">
                                    <div className="text-text-secondary">ยอดขายรวม</div>
                                    <div className="text-3xl font-bold mt-1 tabular-nums">
                                        {formatMoneyTHB(totalSales)} บาท
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-card border border-border/40">
                                    <div className="text-text-secondary">จำนวนออเดอร์</div>
                                    <div className="text-3xl font-bold mt-1 tabular-nums">
                                        {filteredOrders.length} รายการ
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-card border border-border/40">
                                    <div className="text-text-secondary">บิลเฉลี่ย (AOV)</div>
                                    <div className="text-3xl font-bold mt-1 tabular-nums">
                                        {formatMoneyTHB(avgOrder)} บาท
                                    </div>
                                </div>
                            </div>

                            {/* EMPTY */}
                            {isEmpty ? (
                                <div className="p-6 rounded-xl bg-card border border-border/40 text-center">
                                    <div className="text-lg font-semibold">ไม่เจอออเดอร์</div>
                                    <div className="text-text-secondary mt-1">
                                        ลองเปลี่ยนช่วงเวลา หรือเคลียร์คำค้นหา
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* TABLE */}
                                    <Table headers={headers} data={rows} />

                                    {/* PAGINATION */}
                                    <Pagination
                                        page={page}
                                        setPage={setPage}
                                        totalPages={totalPages}
                                        inputPage={inputPage}
                                        setInputPage={setInputPage}
                                    />
                                </>
                            )}
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
