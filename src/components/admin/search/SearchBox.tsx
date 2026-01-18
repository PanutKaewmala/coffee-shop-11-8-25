"use client";

interface SearchBoxProps {
    value: string;

    // เดิมใช้แบบนี้
    setValue?: (value: string) => void;

    // หน้าใหม่ เช่น Recipes จะใช้แบบนี้
    onChange?: (value: string) => void;

    placeholder?: string;
}

export default function SearchBox({
    value,
    setValue,
    onChange,
    placeholder = "ค้นหา...",
}: SearchBoxProps) {
    const handleChange = (v: string) => {
        if (setValue) setValue(v);   // รองรับหน้าเดิม
        if (onChange) onChange(v);   // รองรับหน้าใหม่
    };

    return (
        <div className="mb-4">
            <input
                type="text"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-lg bg-card border border-border/40 
                           focus:outline-none focus:ring-1 focus:ring-accent"
            />
        </div>
    );
}
