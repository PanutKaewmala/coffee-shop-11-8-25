// hooks/useOrdersSearch.ts
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { Order, OrderStatus, PaymentMethod } from "@/lib/types";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";
type StatusFilter = "all" | OrderStatus;
type PaymentFilter = "all" | PaymentMethod;

interface UseOrdersSearchOptions {
    rowsPerPage?: number;
    initialFilter?: DateFilter;
}

function safeDate(dateStr: string) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date) {
    return a.toDateString() === b.toDateString();
}

function isOrderStatus(v: unknown): v is OrderStatus {
    return v === "paid" || v === "void" || v === "refunded";
}

function isPaymentMethod(v: unknown): v is PaymentMethod {
    return v === "cash" || v === "promptpay";
}

export default function useOrdersSearch({
    rowsPerPage = 20,
    initialFilter = "today",
}: UseOrdersSearchOptions = {}) {
    /* -------------------- STATE -------------------- */
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [dateFilter, setDateFilter] = useState<DateFilter>(initialFilter);

    // ✅ new filters
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");

    /* -------------------- LOAD DATA -------------------- */
    const loadOrders = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/orders", { cache: "no-store" });
            const data = await res.json().catch(() => null);

            const list =
                data && Array.isArray(data.orders) ? (data.orders as Order[]) : [];

            // ✅ normalize status/payment ให้มีค่าตลอด (กัน undefined ทำ filter เพี้ยน)
            const normalized = list.map((o) => ({
                ...o,
                status: isOrderStatus(o.status) ? o.status : "paid",
                payment_method: isPaymentMethod(o.payment_method)
                    ? o.payment_method
                    : "cash",
            }));

            setOrders(normalized);
        } catch (err) {
            console.error("โหลดออเดอร์ผิดพลาด:", err);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    /* -------------------- DEBOUNCE SEARCH -------------------- */
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    /* -------------------- QUICK DATE FILTER -------------------- */
    const isWithinFilter = useCallback(
        (d: Date) => {
            const now = new Date();

            switch (dateFilter) {
                case "today":
                    return isSameDay(d, now);

                case "yesterday": {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    return isSameDay(d, y);
                }

                case "7days": {
                    const past = new Date();
                    past.setDate(past.getDate() - 7);
                    return d >= past; // รวมวันนี้ด้วย
                }

                case "month":
                    return (
                        d.getMonth() === now.getMonth() &&
                        d.getFullYear() === now.getFullYear()
                    );

                default:
                    return true;
            }
        },
        [dateFilter]
    );

    /* -------------------- FILTER + SORT -------------------- */
    const filteredOrders = useMemo(() => {
        // 1) date filter
        let result = orders.filter((o) => {
            const d = safeDate(o.created_at);
            if (!d) return false;
            return isWithinFilter(d);
        });

        // 2) status filter
        if (statusFilter !== "all") {
            result = result.filter((o) => o.status === statusFilter);
        }

        // 3) payment filter
        if (paymentFilter !== "all") {
            result = result.filter((o) => o.payment_method === paymentFilter);
        }

        // 4) search (id + datetime th-TH)
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();

            result = result.filter((o) => {
                const id = (o.id ?? "").toLowerCase();
                const d = safeDate(o.created_at);
                const dt = d ? d.toLocaleString("th-TH").toLowerCase() : "";
                return id.includes(q) || dt.includes(q);
            });
        }

        // 5) sort newest first
        return result
            .slice()
            .sort(
                (a, b) =>
                    (safeDate(b.created_at)?.getTime() ?? 0) -
                    (safeDate(a.created_at)?.getTime() ?? 0)
            );
    }, [
        orders,
        debouncedSearch,
        isWithinFilter,
        statusFilter,
        paymentFilter,
    ]);

    /* -------------------- PAGINATION CALC -------------------- */
    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage)),
        [filteredOrders.length, rowsPerPage]
    );

    /* -------------------- RESET PAGE ON FILTER CHANGE -------------------- */
    useEffect(() => {
        setPage(1);
        setInputPage("1");
    }, [debouncedSearch, dateFilter, statusFilter, paymentFilter]);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    /* -------------------- PAGINATED -------------------- */
    const paginatedOrders = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredOrders.slice(start, start + rowsPerPage);
    }, [filteredOrders, page, rowsPerPage]);

    /* -------------------- TOTAL SALES (paid only) -------------------- */
    const totalSales = useMemo(() => {
        return filteredOrders.reduce((sum, o) => {
            const total = typeof o.total === "number" ? o.total : 0;
            return o.status === "paid" ? sum + total : sum;
        }, 0);
    }, [filteredOrders]);

    return {
        loading,

        orders,
        filteredOrders,
        paginatedOrders,

        search,
        setSearch,
        debouncedSearch,

        dateFilter,
        setDateFilter,

        // ✅ new filters
        statusFilter,
        setStatusFilter,
        paymentFilter,
        setPaymentFilter,

        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,

        totalSales,

        refresh: loadOrders,
    };
}
