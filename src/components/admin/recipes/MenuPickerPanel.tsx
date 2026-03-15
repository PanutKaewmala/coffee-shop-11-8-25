"use client";

import SearchBox from "@/components/admin/search/SearchBox";

type UUID = string;

type MenuCard = {
    id: UUID;
    name: string;
    category: string | null;
    created_at: string;
    variantCount: number;
    recipeItemCount: number;
    coverageStatus: "empty_variant" | "no_recipe" | "partial_recipe" | "full_recipe";
};

function coverageText(item: MenuCard): string {
    if (item.coverageStatus === "empty_variant") return "No variant";
    return `${item.recipeItemCount}/${item.variantCount} variants with recipe`;
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

            <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาเมนู..." />

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilter("all")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "all" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    ทั้งหมด
                </button>
                <button
                    onClick={() => setFilter("no_recipe")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "no_recipe" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    ไม่มีสูตร
                </button>
                <button
                    onClick={() => setFilter("partial_recipe")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "partial_recipe" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    สูตรไม่ครบ
                </button>
                <button
                    onClick={() => setFilter("has_recipe")}
                    className={`rounded-full border px-3 py-1 text-sm ${filter === "has_recipe" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                >
                    สูตรครบแล้ว
                </button>
                {showEmptyFilter ? (
                    <button
                        onClick={() => setFilter("empty")}
                        className={`rounded-full border px-3 py-1 text-sm ${filter === "empty" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"}`}
                    >
                        ไม่มี Variant
                    </button>
                ) : null}
            </div>

            <div className="max-h-[65vh] space-y-2 overflow-auto pr-1">
                {loading ? (
                    <div className="text-sm text-[var(--text-secondary)]">Loading...</div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">ไม่พบเมนู</div>
                ) : (
                    items.map((m) => {
                        const active = m.id === selectedMenuId;
                        return (
                            <button
                                key={m.id}
                                onClick={() => onSelectMenu(m.id)}
                                className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--text-muted)]/15 hover:border-[var(--text-muted)]/30"}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="truncate font-medium">{m.name}</div>
                                    <div className="whitespace-nowrap text-xs text-[var(--text-secondary)]">
                                        {m.variantCount} variants
                                    </div>
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">{coverageText(m)}</div>
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
