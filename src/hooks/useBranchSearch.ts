"use client";

import { useState, useEffect, useCallback } from "react";
import type { Branch } from "@/lib/types";

interface UseBranchSearchOptions {
    rowsPerPage?: number;
}

export default function useBranchSearch({
    rowsPerPage = 10,
}: UseBranchSearchOptions = {}) {
    /* --------------------------------
     * STATE
     * -------------------------------- */
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [primary, setPrimary] = useState<"all" | "primary">("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");
    const [totalPages, setTotalPages] = useState(1);

    // ⭐ trigger refresh manually (เมื่อ CRUD เสร็จ)
    const [reloadTrigger, setReloadTrigger] = useState(0);

    /* --------------------------------
     * FETCH DATA (With filters)
     * -------------------------------- */
    const fetchList = useCallback(async () => {
        setLoading(true);

        try {
            const params = new URLSearchParams();

            params.set("page", String(page));
            params.set("limit", String(rowsPerPage));

            if (search.trim()) params.set("search", search.trim());
            if (primary === "primary") params.set("primary", "true");

            const res = await fetch(`/api/branch?${params.toString()}`);
            const json = await res.json();

            setBranches(json.data || []);
            setTotalPages(json.totalPages || 1);
            setInputPage(String(page));
        } catch (err) {
            console.error("useBranchSearch error →", err);
            setBranches([]);
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, search, primary]);

    /* --------------------------------
     * load on mount + whenever filter/pagination changes
     * + reloadTrigger (CRUD refresh)
     * -------------------------------- */
    useEffect(() => {
        fetchList();
    }, [fetchList, reloadTrigger]); // ⭐ FIX: reload on CRUD


    /* --------------------------------
     * PUBLIC: reload entire list (don’t reset filters/page)
     * -------------------------------- */
    const reloadList = useCallback(() => {
        setReloadTrigger((x) => x + 1);     // ⭐ force re-fetch
    }, []);


    /* --------------------------------
     * RETURN
     * -------------------------------- */
    return {
        branches,
        loading,

        search,
        setSearch,

        primary,
        setPrimary,

        page,
        setPage,
        totalPages,

        inputPage,
        setInputPage,

        reloadList, // ⭐ NEW: now correctly triggers refresh
    };
}
