"use client";

interface CategoryFilterProps {
    categories: string[];
    category: string;
    setCategory: (val: string) => void;
}

export default function CategoryFilter({ categories, category, setCategory }: CategoryFilterProps) {
    return (
        <div className="flex flex-wrap gap-2 mb-4">
            {["all", ...categories].map((cat) => (
                <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1 rounded-lg border text-sm
                        ${category === cat
                            ? "bg-accent text-black border-accent"
                            : "bg-card border-border/40"
                        }`}
                >
                    {cat === "all" ? "ทั้งหมด" : cat}
                </button>
            ))}
        </div>
    );
}
