import { Ingredient } from "@/lib/types";

interface Props {
    items: Ingredient[];
    onEdit: (item: Ingredient) => void;
    onDelete: (id: string) => void;
}

export default function IngredientTable({ items, onEdit, onDelete }: Props) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-text-muted/20 bg-surface shadow-md">
            <table className="min-w-full text-text-primary">
                <thead>
                    <tr className="bg-background border-b border-text-muted/20">
                        <th className="p-4 font-semibold text-text-secondary">Name</th>
                        <th className="p-4 font-semibold text-text-secondary">Stock</th>
                        <th className="p-4 font-semibold text-text-secondary">Unit</th>
                        <th className="p-4 font-semibold text-text-secondary w-40">Actions</th>
                    </tr>
                </thead>

                <tbody>
                    {items.map((item) => (
                        <tr
                            key={item.id}
                            className="border-b border-text-muted/10 hover:bg-background/60 transition"
                        >
                            <td className="p-4">{item.name}</td>
                            <td className="p-4">{item.stock}</td>
                            <td className="p-4">{item.unit}</td>
                            <td className="p-4 flex gap-3">
                                <button
                                    onClick={() => onEdit(item)}
                                    className="px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-dark transition"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => onDelete(item.id)}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}