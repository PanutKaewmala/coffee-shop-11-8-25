"use client";

import SearchBox from "@/components/admin/search/SearchBox";

type UUID = string;

type MenuCard = {
    id: UUID;
    name: string;
    category: string | null;
    created_at: string;
    variantCount: number;
};

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
    filter: "all" | "empty";
    setFilter: (v: "all" | "empty") => void;
}) {
    return (
        <div className="rounded-2xl border border-[var(--text-muted)]/15 bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="font-semibold">Menus</div>
                <div className="text-xs text-[var(--text-secondary)]">{items.length}</div>
            </div>

            <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาเมนู..." />

            <div className="flex gap-2">
                <button
                    onClick={() => setFilter("all")}
                    className={`px-3 py-1 rounded-full text-sm border ${filter === "all" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"
                        }`}
                >
                    ทั้งหมด
                </button>
                <button
                    onClick={() => setFilter("empty")}
                    className={`px-3 py-1 rounded-full text-sm border ${filter === "empty" ? "border-[var(--accent)]" : "border-[var(--text-muted)]/25"
                        }`}
                >
                    ไม่มี Variant
                </button>
            </div>

            <div className="space-y-2 max-h-[65vh] overflow-auto pr-1">
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
                                className={`w-full text-left rounded-xl p-3 border transition ${active
                                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                        : "border-[var(--text-muted)]/15 hover:border-[var(--text-muted)]/30"
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-medium truncate">{m.name}</div>
                                    <div className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                        {m.variantCount} variants
                                    </div>
                                </div>
                                {m.category ? (
                                    <div className="text-xs text-[var(--text-secondary)] mt-1">{m.category}</div>
                                ) : null}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
