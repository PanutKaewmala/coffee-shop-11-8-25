"use client";

import React, { useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onAdded?: () => void; // notify parent to reload from DB
}

interface CategoryRow {
    id: string;
    name: string;
    created_at: string;
}

export default function AddCategoryModal({ isOpen, onClose, onAdded }: Props) {
    const [items, setItems] = useState<CategoryRow[]>([]);
    const [filter, setFilter] = useState("");
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    // inline edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState("");

    // ---- helpers / API calls (declare before useEffect so no TDZ error) ----
    async function loadCategories() {
        try {
            setLoading(true);
            const res = await fetch("/api/menu/categories");
            if (!res.ok) {
                console.error("fetch categories failed", await res.text());
                setItems([]);
                return;
            }
            const data: CategoryRow[] = await res.json();
            setItems(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("loadCategories error", err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleAdd() {
        const name = input.trim();
        if (!name) return alert("กรุณากรอกชื่อหมวดหมู่");
        try {
            const res = await fetch("/api/menu/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) {
                const txt = await res.text();
                console.error("add category failed", txt);
                alert("เพิ่มหมวดหมู่ไม่สำเร็จ");
                return;
            }
            setInput("");
            await loadCategories();
            onAdded?.();
        } catch (err) {
            console.error("handleAdd error", err);
            alert("เกิดข้อผิดพลาดขณะเพิ่ม");
        }
    }

    async function handleSaveEdit(id: string) {
        const name = editingValue.trim();
        if (!name) return alert("กรุณากรอกชื่อ");
        try {
            const res = await fetch("/api/menu/categories", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name }),
            });
            if (!res.ok) {
                console.error("edit failed", await res.text());
                alert("แก้ไขไม่สำเร็จ");
                return;
            }
            setEditingId(null);
            setEditingValue("");
            await loadCategories();
            onAdded?.();
        } catch (err) {
            console.error("handleSaveEdit error", err);
            alert("เกิดข้อผิดพลาดขณะแก้ไข");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("ต้องการลบหมวดหมู่นี้ใช่ไหม?")) return;
        try {
            const res = await fetch(`/api/menu/categories?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                console.error("delete failed", await res.text());
                alert("ลบไม่สำเร็จ");
                return;
            }
            // if editing this item, cancel edit
            if (editingId === id) {
                setEditingId(null);
                setEditingValue("");
            }
            await loadCategories();
            onAdded?.();
        } catch (err) {
            console.error("handleDelete error", err);
            alert("เกิดข้อผิดพลาดขณะลบ");
        }
    }

    // ---- effects ----
    useEffect(() => {
        if (!isOpen) return;
        // reset modal local state, then load from DB
        setFilter("");
        setInput("");
        setEditingId(null);
        setEditingValue("");
        loadCategories();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // derived
    const filtered = items.filter((it) =>
        it.name.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Categories">
            <div className="max-w-xl w-full">
                {/* add + search */}
                <div className="flex gap-2 mb-3">
                    <input
                        className="flex-1 p-2 border rounded bg-transparent"
                        placeholder="เพิ่มหมวดหมู่ใหม่"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAdd();
                        }}
                    />
                    <Button onClick={handleAdd}>Add</Button>
                </div>

                <div className="mb-3">
                    <input
                        className="w-full p-2 border rounded bg-transparent"
                        placeholder="ค้นหา..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>

                <div className="border rounded p-2 max-h-[360px] overflow-auto">
                    {loading ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">ไม่พบหมวดหมู่</div>
                    ) : (
                        filtered.map((cat) => (
                            <div
                                key={cat.id}
                                className="flex items-center justify-between gap-3 py-2 px-1 border-b last:border-b-0"
                            >
                                <div className="flex-1 min-w-0">
                                    {editingId === cat.id ? (
                                        <input
                                            className="w-full p-2 border rounded bg-transparent"
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSaveEdit(cat.id);
                                                if (e.key === "Escape") {
                                                    setEditingId(null);
                                                    setEditingValue("");
                                                }
                                            }}
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="truncate">{cat.name}</div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {editingId === cat.id ? (
                                        <>
                                            <button
                                                className="text-sm text-blue-500 hover:underline"
                                                onClick={() => handleSaveEdit(cat.id)}
                                            >
                                                Save
                                            </button>
                                            <button
                                                className="text-sm text-gray-400 hover:underline"
                                                onClick={() => {
                                                    setEditingId(null);
                                                    setEditingValue("");
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="text-sm text-blue-500 hover:underline"
                                                onClick={() => {
                                                    setEditingId(cat.id);
                                                    setEditingValue(cat.name);
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="text-sm text-red-500 hover:underline"
                                                onClick={() => handleDelete(cat.id)}
                                            >
                                                Delete
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-3 text-xs text-[var(--text-secondary)]">
                    ค้นหาเพื่อกรองรายการ — กด Edit เพื่อแก้แบบ inline — กด Enter เพื่อบันทึก
                </div>
            </div>
        </Modal>
    );
}
