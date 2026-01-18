"use client";

import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";

/**
 * Keep this component self-contained.
 * Your DB "news" table currently uses category/title/content/image_url/event_date.
 * If you later add status in DB, just extend NewsStatus union.
 */
export type NewsCategory = string;
export type NewsStatus = "draft" | "published" | "archived";

interface NewsFilterProps {
    category: NewsCategory | "all";
    status: NewsStatus | "all";

    categoryOptions: (NewsCategory | "all")[];
    statusOptions: (NewsStatus | "all")[];

    onCategoryChange: (c: NewsCategory | "all") => void;
    onStatusChange: (s: NewsStatus | "all") => void;
}

export default function NewsFilter({
    category,
    status,
    categoryOptions,
    statusOptions,
    onCategoryChange,
    onStatusChange,
}: NewsFilterProps) {
    return (
        <div className="flex flex-wrap gap-4 items-center">
            {/* CATEGORY FILTER */}
            <div className="flex flex-col">
                <label className="text-sm text-gray-600 mb-1">หมวดหมู่</label>

                <Select
                    value={category}
                    onValueChange={(v) => onCategoryChange(v as NewsCategory | "all")}
                >
                    <SelectTrigger className="min-w-[160px]">
                        <SelectValue placeholder="เลือกหมวด" />
                    </SelectTrigger>

                    <SelectContent>
                        {categoryOptions.map((c) => (
                            <SelectItem key={String(c)} value={String(c)}>
                                {c === "all" ? "ทั้งหมด" : String(c)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* STATUS FILTER */}
            <div className="flex flex-col">
                <label className="text-sm text-gray-600 mb-1">สถานะ</label>

                <Select
                    value={status}
                    onValueChange={(v) => onStatusChange(v as NewsStatus | "all")}
                >
                    <SelectTrigger className="min-w-[160px]">
                        <SelectValue placeholder="เลือกสถานะ" />
                    </SelectTrigger>

                    <SelectContent>
                        {statusOptions.map((s) => (
                            <SelectItem key={String(s)} value={String(s)}>
                                {s === "all"
                                    ? "ทั้งหมด"
                                    : s === "draft"
                                        ? "ร่าง"
                                        : s === "published"
                                            ? "เผยแพร่"
                                            : "เก็บถาวร"}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
