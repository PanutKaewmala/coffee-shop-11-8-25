"use client";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";

interface QuickDateFilterProps {
    dateFilter: DateFilter;
    setDateFilter: (f: DateFilter) => void;
}

export default function QuickDateFilter({
    dateFilter,
    setDateFilter,
}: QuickDateFilterProps) {
    const base = "px-3 py-1.5 rounded-lg text-sm transition-all";

    const active = "bg-[var(--accent)] text-black";
    const inactive =
        "bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-black";

    const btn = (name: DateFilter) =>
        `${base} ${dateFilter === name ? active : inactive}`;

    return (
        <div className="flex gap-2 flex-wrap mb-4">
            <button onClick={() => setDateFilter("today")} className={btn("today")}>
                วันนี้
            </button>

            <button onClick={() => setDateFilter("yesterday")} className={btn("yesterday")}>
                เมื่อวาน
            </button>

            <button onClick={() => setDateFilter("7days")} className={btn("7days")}>
                7 วันล่าสุด
            </button>

            <button onClick={() => setDateFilter("month")} className={btn("month")}>
                เดือนนี้
            </button>

            <button onClick={() => setDateFilter("all")} className={btn("all")}>
                ทั้งหมด
            </button>
        </div>
    );
}
