"use client";

import React from "react";
import SearchBox from "@/components/admin/search/SearchBox";

type UUID = string;

type MenuCard = {
    id: UUID;
    name: string;
    category: string | null;
    created_at: string;
    variantCount: number;
    recipeItemCount: number;
    readyVariantCount: number;
    missingVariantCount: number;
    missingVariantLabels: string[];
    coverageStatus: "empty_variant" | "no_recipe" | "partial_recipe" | "full_recipe";
    recipeStatus: "no_recipe" | "partial_recipe" | "full_recipe";
};

function missingText(labels: string[]): string {
    if (labels.length === 0) return "";
    return `Missing: ${labels.join(", ")}`;
}

function coverageText(item: MenuCard): React.ReactNode {
    const { coverageStatus, variantCount, recipeItemCount, missingVariantLabels } = item;
    const missing = missingText(missingVariantLabels);

    if (coverageStatus === "empty_variant") {
        return <span className="text-sm text-[var(--text-secondary)]">No variant</span>;
    }

    if (coverageStatus === "full_recipe") {
        return (
            <div className="text-sm">
                <div className="font-semibold text-[var(--accent)]">Ready for POS</div>
                <div className="text-xs text-[var(--text-secondary)]">
                    {recipeItemCount}/{variantCount} variants ready
                </div>
            </div>
        );
    }

    if (coverageStatus === "no_recipe") {
        return (
            <div className="space-y-1">
                <div className="font-semibold text-amber-400">Hidden from POS</div>
                <div className="text-xs text-[var(--text-secondary)]">
                    {recipeItemCount}/{variantCount} variants ready
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                    No variants are ready for POS.
                </div>
                {missing ? <div className="text-xs text-amber-300">{missing}</div> : null}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="font-semibold text-yellow-300">
                {recipeItemCount}/{variantCount} variants ready
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
                Some variants are missing recipes and will be hidden from POS until recipes are added.
            </div>
            {missing ? <div className="text-xs text-yellow-200">{missing}</div> : null}
        </div>
    );
}

export default function MenuPickerPanel({
    loading,
    items,
    selectedMenuId,
    onSelectMenu,
    search,
    setSearch,
    filter,
    setFilter,
}: {
    loading: boolean;
    items: MenuCard[];
    selectedMenuId: string;
    onSelectMenu: (id: string) => void;
    search: string;
    setSearch: (v: string) => void;
    filter: "all" | "empty" | "no_recipe" | "partial_recipe" | "has_recipe";
    setFilter: (v: "all" | "empty" | "no_recipe" | "partial_recipe" | "has_recipe") => void;
}) {
    const showEmptyFilter = process.env.NEXT_PUBLIC_SHOW_EMPTY_VARIANT_FILTER === "true";

    return (
        <div className="space-y-3 rounded-2xl border border-[var(--text-muted)]/15 bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between">
                <div className="font-semibold">Menus</div>
                <div className="text-xs text-[var(--text-secondary)]">{items.length}</div>
            </div>

            <SearchBox value={search} setValue={setSearch} placeholder="Search menus..." />

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "all" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    All
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("no_recipe")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "no_recipe" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    No recipe
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("partial_recipe")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "partial_recipe" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    Missing recipes
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("has_recipe")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "has_recipe" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    Ready
                </button>
                {showEmptyFilter ? (
                    <button
                        type="button"
                        onClick={() => setFilter("empty")}
                        className={`rounded-full border px-3 py-1 text-sm ${filter === "empty" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                    >
                        No variant
                    </button>
                ) : null}
            </div>

            <div className="max-h-[65vh] space-y-2 overflow-auto pr-1">
                {loading ? (
                    <div className="text-sm text-[var(--text-secondary)]">Loading...</div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">No menus found</div>
                ) : (
                    items.map((m) => {
                        const active = m.id === selectedMenuId;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => onSelectMenu(m.id)}
                                className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--text-muted)]/15 hover:border-[var(--text-muted)]/30"}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="truncate font-medium">{m.name}</div>
                                    <div className="whitespace-nowrap text-xs text-[var(--text-secondary)]">
                                        {m.variantCount} variants
                                    </div>
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {coverageText(m)}
                                </div>
                                {m.category ? (
                                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{m.category}</div>
                                ) : null}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
