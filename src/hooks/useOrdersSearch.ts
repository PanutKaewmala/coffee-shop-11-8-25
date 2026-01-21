// hooks/useOrdersSearch.ts
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { OrderItem } from "@/lib/types";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";

type OrderStatusUI = "paid" | "cancelled" | "void" | "refunded";
type PaymentMethodUI = "cash" | "promptpay";

type StatusFilter = "all" | OrderStatusUI;
type PaymentFilter = "all" | PaymentMethodUI;

export type OrderLite = {
    id: string;
    total: number;
    created_at: string;

    status: OrderStatusUI;
    payment_method: PaymentMethodUI;

    paid_at: string | null; // ✅ ไม่ optional
    note: string | null;

    cancel_reason: string | null;
    cancel_note: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;

    items: OrderItem[]; // ✅ ไม่ optional
};

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

function isOrderStatus(v: unknown): v is OrderStatusUI {
    return v === "paid" || v === "cancelled" || v === "void" || v === "refunded";
}

function isPaymentMethod(v: unknown): v is PaymentMethodUI {
    return v === "cash" || v === "promptpay";
}

function readStringOrNull(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null;
}

function readNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function isNotNull<T>(v: T | null): v is T {
    return v !== null;
}

export default function useOrdersSearch({
    rowsPerPage = 20,
    initialFilter = "today",
}: UseOrdersSearchOptions = {}) {
    /* -------------------- STATE -------------------- */
    const [orders, setOrders] = useState<OrderLite[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [dateFilter, setDateFilter] = useState<DateFilter>(initialFilter);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");

    /* -------------------- LOAD DATA -------------------- */
    const loadOrders = useCallback(async () => {
        try {
            setLoading(true);

            const res = await fetch("/api/orders", { cache: "no-store" });
            const json: unknown = await res.json().catch(() => null);

            const list =
                json &&
                    typeof json === "object" &&
                    json !== null &&
                    Array.isArray((json as Record<string, unknown>).orders)
                    ? ((json as Record<string, unknown>).orders as unknown[])
                    : [];

            const normalized = list
                .map((raw): OrderLite | null => {
                    if (!raw || typeof raw !== "object") return null;
                    const o = raw as Record<string, unknown>;

                    const id = typeof o.id === "string" ? o.id : "";
                    const created_at = typeof o.created_at === "string" ? o.created_at : "";
                    if (!id || !created_at) return null;

                    const total = readNumber(o.total, 0);

                    const status: OrderStatusUI = isOrderStatus(o.status) ? o.status : "paid";
                    const payment_method: PaymentMethodUI = isPaymentMethod(o.payment_method)
                        ? o.payment_method
                        : "cash";

                    const items: OrderItem[] = Array.isArray(o.items) ? (o.items as OrderItem[]) : [];

                    return {
                        id,
                        total,
                        created_at,

                        status,
                        payment_method,

                        paid_at: readStringOrNull(o.paid_at),
                        note: readStringOrNull(o.note),

                        cancel_reason: readStringOrNull(o.cancel_reason),
                        cancel_note: readStringOrNull(o.cancel_note),
                        cancelled_at: readStringOrNull(o.cancelled_at),
                        cancelled_by: readStringOrNull(o.cancelled_by),

                        items,
                    };
                })
                .filter(isNotNull);

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
                    return d >= past;
                }

                case "month":
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

                default:
                    return true;
            }
        },
        [dateFilter]
    );

    /* -------------------- FILTER + SORT -------------------- */
    const filteredOrders = useMemo(() => {
        let result = orders.filter((o) => {
            const d = safeDate(o.created_at);
            if (!d) return false;
            return isWithinFilter(d);
        });

        if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
        if (paymentFilter !== "all") result = result.filter((o) => o.payment_method === paymentFilter);

        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter((o) => {
                const id = (o.id ?? "").toLowerCase();
                const d = safeDate(o.created_at);
                const dt = d ? d.toLocaleString("th-TH").toLowerCase() : "";
                return id.includes(q) || dt.includes(q);
            });
        }

        return result
            .slice()
            .sort(
                (a, b) =>
                    (safeDate(b.created_at)?.getTime() ?? 0) -
                    (safeDate(a.created_at)?.getTime() ?? 0)
            );
    }, [orders, debouncedSearch, isWithinFilter, statusFilter, paymentFilter]);

    /* -------------------- PAGINATION -------------------- */
    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage)),
        [filteredOrders.length, rowsPerPage]
    );

    useEffect(() => {
        setPage(1);
        setInputPage("1");
    }, [debouncedSearch, dateFilter, statusFilter, paymentFilter]);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    const paginatedOrders = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredOrders.slice(start, start + rowsPerPage);
    }, [filteredOrders, page, rowsPerPage]);

    /* -------------------- TOTAL SALES (paid only) -------------------- */
    const totalSales = useMemo(() => {
        return filteredOrders.reduce((sum, o) => (o.status === "paid" ? sum + o.total : sum), 0);
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
