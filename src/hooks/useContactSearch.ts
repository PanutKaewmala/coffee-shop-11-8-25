"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

/* =========================
   UI Types
========================= */
export type Category =
    | "all"
    | "question"
    | "feedback"
    | "complaint"
    | "business"
    | "other";

export type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";

interface UseContactSearchOptions {
    rowsPerPage?: number;
}

/* =========================
   Normalized UI Row
========================= */
export type ContactUI = {
    id: string;
    name: string;
    email: string;
    message: string;
    created_at: string | null;
    category: Exclude<Category, "all">;
};

/* =========================
   API Raw Shape (unknown-safe)
========================= */
type ApiContactRow = {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    message?: unknown;
    created_at?: unknown;
    category?: unknown;
};

/* =========================
   Helpers (NO any)
========================= */
function asString(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function asStringOrNull(v: unknown): string | null {
    return typeof v === "string" ? v : null;
}

/* ---- category guard (no any) ---- */
const allowedCategories = [
    "question",
    "feedback",
    "complaint",
    "business",
    "other",
] as const;

type AllowedCategory = (typeof allowedCategories)[number];

function isAllowedCategory(v: string): v is AllowedCategory {
    return allowedCategories.includes(v as AllowedCategory);
}

function normalizeCategory(v: unknown): AllowedCategory {
    const s = typeof v === "string" ? v : "";
    return isAllowedCategory(s) ? s : "other";
}

function normalizeRow(row: ApiContactRow): ContactUI | null {
    const id = asString(row.id).trim();
    if (!id) return null;

    return {
        id,
        name: asString(row.name),
        email: asString(row.email),
        message: asString(row.message),
        created_at: asStringOrNull(row.created_at),
        category: normalizeCategory(row.category),
    };
}

/* =========================
   Hook
========================= */
export default function useContactSearch({
    rowsPerPage = 10,
}: UseContactSearchOptions = {}) {
    /* RAW DATA */
    const [rawContacts, setRawContacts] = useState<ContactUI[]>([]);
    const [loading, setLoading] = useState(true);

    /* PAGINATION */
    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");
    const [totalPages, setTotalPages] = useState(1);

    /* FILTER */
    const [filter, setFilterState] = useState<{
        search: string;
        category: Category;
        date: DateFilter;
    }>({
        search: "",
        category: "all",
        date: "all",
    });

    const setFilter = useCallback(
        (patch: Partial<{ search: string; category: Category; date: DateFilter }>) => {
            setFilterState((prev) => ({ ...prev, ...patch }));
        },
        []
    );

    /* FETCH */
    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/contact", { cache: "no-store" });
            const json = (await res.json()) as unknown;

            if (Array.isArray(json)) {
                const normalized = json
                    .map((r) => normalizeRow(r as ApiContactRow))
                    .filter((x): x is ContactUI => x !== null);

                setRawContacts(normalized);
            } else {
                setRawContacts([]);
            }

            setPage(1);
            setInputPage("1");
        } catch (err) {
            console.error("useContactSearch fetch error →", err);
            setRawContacts([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    /* RESET PAGE ON FILTER CHANGE */
    useEffect(() => {
        setPage(1);
        setInputPage("1");
    }, [filter.search, filter.category, filter.date]);

    /* CATEGORY FILTER */
    const filteredCategory = useMemo(() => {
        if (filter.category === "all") return rawContacts;
        return rawContacts.filter((c) => c.category === filter.category);
    }, [rawContacts, filter.category]);

    /* DATE FILTER */
    const filteredDate = useMemo(() => {
        if (filter.date === "all") return filteredCategory;

        return filteredCategory.filter((c) => {
            if (!c.created_at) return false;

            const created = new Date(c.created_at);
            if (Number.isNaN(created.getTime())) return false;

            const now = new Date();
            const diffDays =
                (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

            switch (filter.date) {
                case "today":
                    return created.toDateString() === now.toDateString();
                case "yesterday": {
                    const y = new Date(now);
                    y.setDate(now.getDate() - 1);
                    return created.toDateString() === y.toDateString();
                }
                case "7days":
                    return diffDays <= 7;
                case "month":
                    return (
                        created.getMonth() === now.getMonth() &&
                        created.getFullYear() === now.getFullYear()
                    );
                default:
                    return true;
            }
        });
    }, [filteredCategory, filter.date]);

    /* SEARCH */
    const searched = useMemo(() => {
        const q = filter.search.trim().toLowerCase();
        if (!q) return filteredDate;

        return filteredDate.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                c.message.toLowerCase().includes(q)
        );
    }, [filteredDate, filter.search]);

    /* PAGINATION */
    useEffect(() => {
        const pages = Math.max(1, Math.ceil(searched.length / rowsPerPage));
        setTotalPages(pages);
        if (page > pages) setPage(1);
    }, [searched, rowsPerPage, page]);

    const paginated = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return searched.slice(start, start + rowsPerPage);
    }, [searched, page, rowsPerPage]);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    return {
        loading,
        contacts: paginated,
        raw: rawContacts,

        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,

        filter,
        setFilter,

        reloadList: fetchList,
    };
}
