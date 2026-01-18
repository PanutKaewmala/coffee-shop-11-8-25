"use client";

import { useMemo } from "react";
import type { NewsItem, NewsCategory } from "@/lib/types";

interface NewsSearchOptions {
    searchText?: string;
    category?: NewsCategory | "all";
    dateRange?: {
        from?: string | null;
        to?: string | null;
    };
    page?: number;
    rowsPerPage?: number;
}

/* =========================
   Helpers (NO any)
========================= */
function toLowerSafe(v: unknown): string {
    return typeof v === "string" ? v.toLowerCase() : "";
}

function toTimeOrNull(dateLike: unknown): number | null {
    if (typeof dateLike !== "string" || !dateLike.trim()) return null;
    const t = new Date(dateLike).getTime();
    return Number.isFinite(t) ? t : null;
}

export default function useNewsSearch(news: NewsItem[] = [], options: NewsSearchOptions) {
    const {
        searchText = "",
        category = "all",
        dateRange,
        page = 1,
        rowsPerPage = 10,
    } = options;

    /** ----------------------------
     *  SEARCH + FILTER
     * ----------------------------- */
    const filtered = useMemo(() => {
        let result = news.slice();

        // 🔍 SEARCH — title only
        const q = searchText.trim().toLowerCase();
        if (q) {
            result = result.filter((n) => toLowerSafe(n.title).includes(q));
        }

        // 🏷 FILTER BY CATEGORY
        if (category !== "all") {
            result = result.filter((n) => n.category === category);
        }

        // 📅 FILTER BY EVENT DATE RANGE
        const from = toTimeOrNull(dateRange?.from ?? null);
        const to = toTimeOrNull(dateRange?.to ?? null);

        if (from !== null || to !== null) {
            result = result.filter((n) => {
                const event = toTimeOrNull(n.event_date);
                if (event === null) return false;
                if (from !== null && event < from) return false;
                if (to !== null && event > to) return false;
                return true;
            });
        }

        // 🕒 SORT BY EVENT DATE (latest first)
        result.sort((a, b) => {
            const ta = toTimeOrNull(a.event_date);
            const tb = toTimeOrNull(b.event_date);

            // push missing/invalid dates to bottom
            if (ta === null && tb === null) return 0;
            if (ta === null) return 1;
            if (tb === null) return -1;

            return tb - ta;
        });

        return result;
    }, [news, searchText, category, dateRange]);

    /** ----------------------------
     *  PAGINATION
     * ----------------------------- */
    const totalPages = useMemo(() => {
        const pages = Math.ceil(filtered.length / rowsPerPage);
        return pages > 0 ? pages : 1;
    }, [filtered.length, rowsPerPage]);

    const paginated = useMemo(() => {
        const safePage = Math.min(Math.max(1, page), totalPages);
        const start = (safePage - 1) * rowsPerPage;
        return filtered.slice(start, start + rowsPerPage);
    }, [filtered, page, rowsPerPage, totalPages]);

    /** ----------------------------
     *  RETURN
     * ----------------------------- */
    return {
        filteredRows: filtered,
        paginatedRows: paginated,
        totalPages,
        totalRows: filtered.length,
    };
}
