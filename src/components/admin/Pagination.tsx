"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback } from "react";

type PaginationProps = {
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    totalPages: number;
    inputPage: string;
    setInputPage: React.Dispatch<React.SetStateAction<string>>;
};

export default function Pagination({
    page,
    setPage,
    totalPages,
    inputPage,
    setInputPage,
}: PaginationProps) {
    const nextPage = () => page < totalPages && setPage((p) => p + 1);
    const prevPage = () => page > 1 && setPage((p) => p - 1);

    const commit = useCallback(() => {
        const v = inputPage.trim();
        if (!v) return setInputPage(String(page));

        const val = Number(v);
        if (!Number.isFinite(val) || val < 1 || val > totalPages) {
            return setInputPage(String(page));
        }

        setPage(val);
    }, [inputPage, page, totalPages, setPage, setInputPage]);

    return (
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 mt-6">
            {/* Input */}
            <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={inputPage}
                onChange={(e) => {
                    const next = e.target.value;
                    if (next === "" || /^[0-9]+$/.test(next)) setInputPage(next);
                }}
                onKeyDown={(e) => e.key === "Enter" && commit()}
                onBlur={commit}
                className="w-20 px-2 py-1 text-center rounded-lg bg-card border border-border/40
                           focus:ring-1 focus:ring-accent"
            />

            {/* Prev */}
            <button
                onClick={prevPage}
                disabled={page === 1}
                className="p-2 rounded-lg border border-border/40 hover:bg-border/10 disabled:opacity-30"
                aria-label="หน้าก่อนหน้า"
            >
                <ChevronLeft size={18} />
            </button>

            {/* Text */}
            <span className="text-sm text-text-secondary">
                {page} / {totalPages}
            </span>

            {/* Next */}
            <button
                onClick={nextPage}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-border/40 hover:bg-border/10 disabled:opacity-30"
                aria-label="หน้าถัดไป"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    );
}
