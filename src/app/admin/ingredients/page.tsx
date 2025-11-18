"use client";

import { useEffect, useState } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";
import { Ingredient } from "@/lib/types";
import AdjustStockForm from "@/components/admin/AdjustStockForm";

export default function IngredientsAdminPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);

    // modal สำหรับ add/edit
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<Ingredient | null>(null);

    // modal สำหรับ adjust
    const [adjustItem, setAdjustItem] = useState<Ingredient | null>(null);

    // form add/edit
    const [name, setName] = useState("");
    const [stock, setStock] = useState<number | string>("");
    const [unit, setUnit] = useState("");

    /* ------------------------------------
     * Load Ingredients
     * ---------------------------------- */
    const fetchIngredients = async () => {
        try {
            setLoading(true);

            const res = await fetch("/api/ingredients");
            const data = await res.json();

            const list = Array.isArray(data) ? data : [];
            setIngredients(list);
        } catch (err) {
            console.error("fetchIngredients error:", err);
            setIngredients([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIngredients();
    }, []);

    /* ------------------------------------
     * Add/Edit Modal
     * ---------------------------------- */
    const openModal = (item?: Ingredient) => {
        if (item) {
            setEditingItem(item);
            setName(item.name);
            setStock(item.stock);
            setUnit(item.unit);
        } else {
            setEditingItem(null);
            setName("");
            setStock("");
            setUnit("");
        }

        setShowModal(true);
    };

    const closeModal = () => setShowModal(false);

    const saveIngredient = async () => {
        if (!name.trim()) return alert("Name is required");
        if (!stock || Number(stock) < 0) return alert("Stock invalid");
        if (!unit.trim()) return alert("Unit is required");

        const body = { name, stock: Number(stock), unit };

        const method = editingItem ? "PUT" : "POST";
        const payload = editingItem ? { ...body, id: editingItem.id } : body;

        await fetch("/api/ingredients", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        await fetchIngredients();
        closeModal();
    };

    /* ------------------------------------
     * Delete Ingredient
     * ---------------------------------- */
    const deleteIngredient = async (id: string) => {
        if (!confirm("Delete this ingredient?")) return;

        await fetch(`/api/ingredients?id=${id}`, {
            method: "DELETE",
        });

        fetchIngredients();
    };

    const headers = ["Name", "Stock", "Unit", "Actions"];

    /* ------------------------------------
     * Render
     * ---------------------------------- */
    return (
        <div className="p-6 space-y-6">
            <Card title="Ingredients">
                <div className="flex justify-end mb-4">
                    <Button onClick={() => openModal()}>+ Add Ingredient</Button>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <Table
                        headers={headers}
                        data={ingredients.map((item) => [
                            item.name,
                            item.stock,
                            item.unit,
                            <div key={item.id} className="flex gap-2">
                                {/* EDIT */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openModal(item)}
                                >
                                    Edit
                                </Button>

                                {/* ADJUST */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAdjustItem(item)}
                                >
                                    Adjust
                                </Button>

                                {/* DELETE */}
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => deleteIngredient(item.id)}
                                >
                                    Delete
                                </Button>
                            </div>,
                        ])}
                    />
                )}
            </Card>

            {/* ADD / EDIT MODAL */}
            {showModal && (
                <Modal
                    isOpen={showModal}
                    onClose={closeModal}
                    title={editingItem ? "Edit Ingredient" : "Add Ingredient"}
                >
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />

                        <input
                            type="number"
                            placeholder="Stock"
                            value={stock}
                            onChange={(e) => setStock(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />

                        <input
                            type="text"
                            placeholder="Unit (g, ml, pcs)"
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeModal}>
                                Cancel
                            </Button>

                            <Button onClick={saveIngredient}>
                                {editingItem ? "Update" : "Add"}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ADJUST STOCK MODAL */}
            {adjustItem && (
                <AdjustStockForm
                    ingredient={adjustItem}
                    onClose={() => setAdjustItem(null)}
                    onUpdated={fetchIngredients}
                />
            )}
        </div>
    );
}
