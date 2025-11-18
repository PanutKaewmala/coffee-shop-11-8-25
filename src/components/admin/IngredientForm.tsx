"use client";

import { useState } from "react";
import { Ingredient } from "@/lib/types";

interface Props {
    initialData: Ingredient | null;
    onClose: () => void;
    onSave: (values: Partial<Ingredient>) => void;
}

export default function IngredientForm({ initialData, onClose, onSave }: Props) {
    const [name, setName] = useState(initialData?.name ?? "");
    const [stock, setStock] = useState<number>(initialData?.stock ?? 0);
    const [unit, setUnit] = useState(initialData?.unit ?? "");

    const handleSubmit = () => {
        if (!name.trim() || !unit.trim()) return;
        onSave({ name, stock, unit });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-surface text-text-primary p-6 rounded-2xl w-full max-w-md shadow-xl border border-text-muted/30">
                <h2 className="text-xl font-semibold mb-4 text-text-primary">
                    {initialData ? "Edit Ingredient" : "Add Ingredient"}
                </h2>

                <div className="space-y-5">
                    <div>
                        <label className="block mb-1 font-medium text-text-secondary">Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border border-text-muted/30 bg-background text-text-primary p-3 rounded-xl focus:outline-none focus:border-accent transition"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-text-secondary">Stock</label>
                        <input
                            type="number"
                            value={stock}
                            onChange={(e) => setStock(Number(e.target.value))}
                            className="w-full border border-text-muted/30 bg-background text-text-primary p-3 rounded-xl focus:outline-none focus:border-accent transition"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-text-secondary">Unit</label>
                        <input
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="w-full border border-text-muted/30 bg-background text-text-primary p-3 rounded-xl focus:outline-none focus:border-accent transition"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-text-muted/20 text-text-secondary hover:bg-text-muted/30 transition"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent-dark transition shadow-sm"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
