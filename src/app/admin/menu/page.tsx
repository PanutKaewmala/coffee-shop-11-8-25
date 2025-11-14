"use client";

import { useState, useEffect } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/lib/types";

export default function MenuAdminPage() {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

    // Form fields
    const [name, setName] = useState("");
    const [price, setPrice] = useState<number | string>("");
    const [category, setCategory] = useState("");
    const [serveTypes, setServeTypes] = useState<string[]>([]);
    const [description, setDescription] = useState("");
    const [image, setImage] = useState<File | null>(null);

    const SERVE_OPTIONS = ["Hot", "Iced", "Frappe"];

    /* -----------------------------------
     * Fetch Menu (แก้ให้ถูก 100%)
     * ----------------------------------*/
    const fetchMenu = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/menu");
            const data = await res.json();

            // ⭐ รองรับทั้งแบบ array และแบบ {menu: [...]}
            const list = Array.isArray(data)
                ? data
                : Array.isArray(data.menu)
                    ? data.menu
                    : [];

            setMenuItems(list);
        } catch (err) {
            console.error("fetchMenu error →", err);
            setMenuItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMenu();
    }, []);

    /* -----------------------------------
     * Open Modal (Add/Edit)
     * ----------------------------------*/
    const openModal = (item?: MenuItem) => {
        if (item) {
            setEditingItem(item);
            setName(item.name);
            setPrice(item.price);
            setCategory(item.category);
            setServeTypes(item.serveTypes ?? []);
            setDescription(item.description ?? "");
        } else {
            setEditingItem(null);
            setName("");
            setPrice("");
            setCategory("");
            setServeTypes([]);
            setDescription("");
            setImage(null);
        }
        setShowModal(true);
    };

    const closeModal = () => setShowModal(false);

    /* -----------------------------------
     * Save Menu (POST / PUT)
     * ----------------------------------*/
    const saveMenu = async () => {
        const parsedPrice = Number(price);
        if (isNaN(parsedPrice)) {
            alert("Price must be a valid number");
            return;
        }
        if (!name.trim()) return alert("Name is required");
        if (!category.trim()) return alert("Category is required");
        if (serveTypes.length === 0) return alert("Select at least one serve type");

        let imageUrl = editingItem?.image || "";

        // Upload image
        if (image) {
            const fd = new FormData();
            fd.append("files", image);

            const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
            const uploadData = await uploadRes.json();

            if (uploadRes.ok && uploadData.urls?.[0]) {
                imageUrl = uploadData.urls[0];
            } else {
                alert("Image upload failed");
                return;
            }
        }

        const body = {
            name,
            price: parsedPrice,
            category,
            serveTypes,
            description,
            image: imageUrl,
        };

        try {
            const method = editingItem ? "PUT" : "POST";

            await fetch("/api/menu", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingItem ? { ...body, id: editingItem.id } : body),
            });

            await fetchMenu();
            closeModal();
        } catch (err) {
            console.error("saveMenu error →", err);
            alert("Something went wrong while saving menu");
        }
    };

    /* -----------------------------------
     * Delete Menu
     * ----------------------------------*/
    const deleteMenu = async (id: string) => {
        if (!confirm("Delete this item?")) return;

        await fetch(`/api/menu?id=${id}`, { method: "DELETE" });
        fetchMenu();
    };

    const headers = ["Name", "Category", "Serve", "Price", "Image", "Actions"];

    /* -----------------------------------
     * Render UI
     * ----------------------------------*/
    return (
        <div className="p-6 space-y-6">
            <Card title="Menu Management">
                <div className="flex justify-end mb-4">
                    <Button onClick={() => openModal()}>+ Add Menu</Button>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <Table
                            headers={headers}
                            data={menuItems.map((item) => [
                                item.name,
                                item.category,
                                item.serveTypes?.join(", ") || "—",
                                `${item.price}฿`,
                                item.image ? (
                                    <img
                                        key={item.id}
                                        src={item.image}
                                        alt={item.name}
                                        className="w-16 h-16 object-cover rounded"
                                    />
                                ) : (
                                    "-"
                                ),
                                <div key={item.id} className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openModal(item)}>
                                        Edit
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => deleteMenu(item.id)}>
                                        Delete
                                    </Button>
                                </div>,
                            ])}
                        />
                    </div>
                )}
            </Card>

            {/* Modal */}
            {showModal && (
                <Modal isOpen={showModal} onClose={closeModal} title={editingItem ? "Edit Menu" : "Add Menu"}>
                    <div className="space-y-4">
                        {/* Name */}
                        <input
                            type="text"
                            placeholder="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />

                        {/* Price */}
                        <input
                            type="number"
                            placeholder="Price"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />

                        {/* Category */}
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="
                                w-full p-2 rounded-md border
                                bg-[var(--surface)]
                                text-[var(--text-primary)]
                                border-[var(--text-muted)]/40
                                focus:outline-none
                                focus:ring-2
                                focus:ring-[var(--accent)]
                                hover:bg-[var(--surface-hover)]
                            "
                        >
                            <option value="">Select category</option>
                            <option value="coffee">Coffee</option>
                            <option value="tea">Tea</option>
                            <option value="milk-choco">Milk / Chocolate</option>
                        </select>

                        {/* ⭐ Serve Types */}
                        <div className="space-y-2">
                            <p className="text-sm text-[var(--text-secondary)]">Serve Types</p>

                            {SERVE_OPTIONS.map((opt) => (
                                <label key={opt} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={serveTypes.includes(opt)}
                                        onChange={() =>
                                            setServeTypes((prev) =>
                                                prev.includes(opt)
                                                    ? prev.filter((v) => v !== opt)
                                                    : [...prev, opt]
                                            )
                                        }
                                    />
                                    <span>{opt}</span>
                                </label>
                            ))}
                        </div>

                        {/* Description */}
                        <textarea
                            placeholder="Description (optional)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full border rounded-md p-2"
                        />

                        {/* Image */}
                        <input type="file" onChange={(e) => setImage(e.target.files?.[0] || null)} />

                        {/* Buttons */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeModal}>
                                Cancel
                            </Button>
                            <Button onClick={saveMenu}>{editingItem ? "Update" : "Add"}</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
