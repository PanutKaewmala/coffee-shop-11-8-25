"use client";

import { useState, useEffect, useCallback } from "react";
import type { Branch } from "@/lib/types";

interface UseBranchSearchOptions {
    rowsPerPage?: number;
}

type BranchListResponse = {
    data?: Branch[];
    totalPages?: number;
    error?: string;
};

export default function useBranchSearch({
    rowsPerPage = 10,
}: UseBranchSearchOptions = {}) {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [primary, setPrimary] = useState<"all" | "primary">("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("1");
    const [totalPages, setTotalPages] = useState(1);

    const [reloadTrigger, setReloadTrigger] = useState(0);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("limit", String(rowsPerPage));

            if (search.trim()) params.set("search", search.trim());
            if (primary === "primary") params.set("primary", "true");

            const res = await fetch(`/api/branch?${params.toString()}`);
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `Request failed: ${res.status}`);
            }

            const json = (await res.json()) as BranchListResponse;
            if (json.error) {
                throw new Error(json.error);
            }

            setBranches(Array.isArray(json.data) ? json.data : []);
            setTotalPages(
                Number.isFinite(Number(json.totalPages)) && Number(json.totalPages) > 0
                    ? Number(json.totalPages)
                    : 1
            );
            setInputPage(String(page));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to load branches";
            console.error("useBranchSearch error ->", msg);
            setError(msg);
            setBranches([]);
            setTotalPages(1);
            setInputPage(String(page));
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, search, primary]);

    useEffect(() => {
        fetchList();
    }, [fetchList, reloadTrigger]);

    const reloadList = useCallback(() => {
        setReloadTrigger((x) => x + 1);
    }, []);

    return {
        branches,
        loading,
        error,
        search,
        setSearch,
        primary,
        setPrimary,
        page,
        setPage,
        totalPages,
        inputPage,
        setInputPage,
        reloadList,
    };
}
