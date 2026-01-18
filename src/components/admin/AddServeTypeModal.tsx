"use client";

import React, { useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onAdded?: () => void; // แจ้ง parent ว่ามีการเปลี่ยนแปลง
}

interface ServeRow {
    id: string;
    name: string;
    created_at: string;
}

export default function AddServeTypeModal({ isOpen, onClose, onAdded }: Props) {
    const [items, setItems] = useState<ServeRow[]>([]);
    const [filter, setFilter] = useState("");
    const [input, setInput] = useState("");

    const [loading, setLoading] = useState(false);

    // inline edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState("");

    /* -----------------------------------------------------------
     *  LOAD FROM DB  (ประกาศก่อนใช้)
     * ----------------------------------------------------------- */
    async function loadServeTypes() {
        try {
            setLoading(true);
            const res = await fetch("/api/menu/serves");
            if (!res.ok) {
                console.error("Failed to fetch serve types", await res.text());
                setItems([]);
                return;
            }
            const data: ServeRow[] = await res.json();
            setItems(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("loadServeTypes error", err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    /* -----------------------------------------------------------
     * ADD SERVE TYPE
     * ----------------------------------------------------------- */
    async function handleAdd() {
        const name = input.trim();
        if (!name) return alert("กรุณากรอกประเภทเสิร์ฟ");

        try {
            const res = await fetch("/api/menu/serves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            if (!res.ok) {
                console.error("Add serve type failed", await res.text());
                alert("เพิ่มประเภทเสิร์ฟไม่สำเร็จ");
                return;
            }

            setInput("");
            await loadServeTypes();
            onAdded?.();
        } catch (err) {
            console.error("handleAdd error", err);
            alert("เกิดข้อผิดพลาดขณะเพิ่ม");
        }
    }

    /* -----------------------------------------------------------
     * UPDATE SERVE TYPE
     * ----------------------------------------------------------- */
    async function handleSaveEdit(id: string) {
        const name = editingValue.trim();
        if (!name) return alert("กรุณากรอกชื่อ");

        try {
            const res = await fetch("/api/menu/serves", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name }),
            });

            if (!res.ok) {
                console.error("update failed", await res.text());
                alert("แก้ไขไม่สำเร็จ");
                return;
            }

            setEditingId(null);
            setEditingValue("");
            await loadServeTypes();
            onAdded?.();
        } catch (err) {
            console.error("handleSaveEdit error", err);
            alert("เกิดข้อผิดพลาดขณะแก้ไข");
        }
    }

    /* -----------------------------------------------------------
     * DELETE SERVE TYPE
     * ----------------------------------------------------------- */
    async function handleDelete(id: string) {
        if (!confirm("ต้องการลบประเภทเสิร์ฟนี้ใช่ไหม?")) return;

        try {
            const res = await fetch(`/api/menu/serves?id=${id}`, {
                method: "DELETE",
            });

            if (!res.ok) {
                console.error("delete failed", await res.text());
                alert("ลบไม่สำเร็จ");
                return;
            }

            if (editingId === id) {
                setEditingId(null);
                setEditingValue("");
            }

            await loadServeTypes();
            onAdded?.();
        } catch (err) {
            console.error("handleDelete error", err);
            alert("เกิดข้อผิดพลาดขณะลบ");
        }
    }

    /* -----------------------------------------------------------
     * LOAD WHEN MODAL OPEN
     * ----------------------------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;
        setFilter("");
        setInput("");
        setEditingId(null);
        setEditingValue("");

        loadServeTypes();
    }, [isOpen]);

    /* -----------------------------------------------------------
     * FILTER LIST
     * ----------------------------------------------------------- */
    const filtered = items.filter((it) =>
        it.name.toLowerCase().includes(filter.toLowerCase())
    );

    /* -----------------------------------------------------------
     * RENDER
     * ----------------------------------------------------------- */
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Serve Types">
            <div className="max-w-xl w-full">
                {/* ADD INPUT */}
                <div className="flex gap-2 mb-3">
                    <input
                        className="flex-1 p-2 border rounded bg-transparent"
                        placeholder="เพิ่มประเภทเสิร์ฟใหม่"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    />
                    <Button onClick={handleAdd}>Add</Button>
                </div>

                {/* SEARCH */}
                <div className="mb-3">
                    <input
                        className="w-full p-2 border rounded bg-transparent"
                        placeholder="ค้นหา..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>

                {/* LIST */}
                <div className="border rounded p-2 max-h-[360px] overflow-auto">
                    {loading ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">
                            Loading...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">
                            ไม่พบประเภทเสิร์ฟ
                        </div>
                    ) : (
                        filtered.map((s) => (
                            <div
                                key={s.id}
                                className="flex items-center justify-between gap-3 py-2 px-1 border-b last:border-b-0"
                            >
                                <div className="flex-1 min-w-0">
                                    {editingId === s.id ? (
                                        <input
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSaveEdit(s.id);
                                                if (e.key === "Escape") {
                                                    setEditingId(null);
                                                    setEditingValue("");
                                                }
                                            }}
                                            className="w-full p-2 border rounded bg-transparent"
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="truncate">{s.name}</div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {editingId === s.id ? (
                                        <>
                                            <button
                                                className="text-sm text-blue-500 hover:underline"
                                                onClick={() => handleSaveEdit(s.id)}
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
                                                    setEditingId(s.id);
                                                    setEditingValue(s.name);
                                                }}
                                            >
                                                Edit
                                            </button>

                                            <button
                                                className="text-sm text-red-500 hover:underline"
                                                onClick={() => handleDelete(s.id)}
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
