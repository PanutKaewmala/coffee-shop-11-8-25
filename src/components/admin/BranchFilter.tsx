"use client";

interface BranchFilterProps {
    primary: "all" | "primary";
    setPrimary: (v: "all" | "primary") => void;
}

export default function BranchFilter({
    primary,
    setPrimary,
}: BranchFilterProps) {
    return (
        <div className="flex gap-2 flex-wrap mb-3">

            <button
                onClick={() => setPrimary("all")}
                className={`px-3 py-1.5 rounded-lg text-sm ${primary === "all"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-black"
                    }`}
            >
                ทั้งหมด
            </button>

            <button
                onClick={() => setPrimary("primary")}
                className={`px-3 py-1.5 rounded-lg text-sm ${primary === "primary"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-black"
                    }`}
            >
                เฉพาะสาขาหลัก
            </button>

        </div>
    );
}
