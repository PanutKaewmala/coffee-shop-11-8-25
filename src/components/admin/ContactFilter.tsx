"use client";

import type { Category, DateFilter } from "@/hooks/useContactSearch";

interface ContactFilterProps {
    filter: {
        search: string;
        category: Category;
        date: DateFilter;
    };
    setFilter: (patch: Partial<{
        search: string;
        category: Category;
        date: DateFilter;
    }>) => void;
}

export default function ContactFilter({ filter, setFilter }: ContactFilterProps) {
    const btn = (active: boolean) =>
        `px-3 py-1.5 rounded-lg text-sm font-medium transition 
         ${active
            ? "bg-[var(--accent)] text-black"
            : "bg-[var(--surface)] text-[var(--text-secondary)]"
        }`;

    return (
        <div className="space-y-3 mb-4">

            {/* CATEGORY FILTER */}
            <div className="flex flex-wrap gap-2">
                {[
                    { key: "all", label: "ทั้งหมด" },
                    { key: "question", label: "คำถาม" },
                    { key: "feedback", label: "ข้อเสนอแนะ" },
                    { key: "complaint", label: "ร้องเรียน" },
                    { key: "business", label: "เสนอธุรกิจ" },
                    { key: "other", label: "อื่น ๆ" },
                ].map((item) => (
                    <button
                        key={item.key}
                        className={btn(filter.category === item.key)}
                        onClick={() => setFilter({ category: item.key as Category })}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {/* DATE FILTER */}
            <div className="flex flex-wrap gap-2">
                {[
                    { key: "all", label: "ทุกเวลา" },
                    { key: "today", label: "วันนี้" },
                    { key: "yesterday", label: "เมื่อวาน" },
                    { key: "7days", label: "7 วันล่าสุด" },
                    { key: "month", label: "เดือนนี้" },
                ].map((item) => (
                    <button
                        key={item.key}
                        className={btn(filter.date === item.key)}
                        onClick={() => setFilter({ date: item.key as DateFilter })}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
