"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onAdded?: () => void;
}

interface CategoryRow {
    id: string;
    name: string;
    created_at: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

async function readApiError(res: Response, fallback: string): Promise<string> {
    try {
        const data: unknown = await res.clone().json();
        if (isRecord(data) && typeof data.error === "string" && data.error.trim()) {
            return data.error;
        }
    } catch {
        // ignore and fallback to text
    }

    try {
        const text = await res.text();
        if (text.trim()) return text;
    } catch {
        // ignore
    }

    return fallback;
}

export default function AddCategoryModal({ isOpen, onClose, onAdded }: Props) {
    const [items, setItems] = useState<CategoryRow[]>([]);
    const [filter, setFilter] = useState("");
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [actionError, setActionError] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState("");

    async function loadCategories() {
        try {
            setLoading(true);
            const res = await fetch("/api/menu/categories", { cache: "no-store" });
            if (!res.ok) {
                const msg = await readApiError(res, "โหลดหมวดเมนูไม่สำเร็จ");
                setActionError(msg);
                setItems([]);
                return;
            }

            const data: unknown = await res.json().catch(() => []);
            setItems(Array.isArray(data) ? (data as CategoryRow[]) : []);
        } catch (err) {
            void err;
            setItems([]);
            setActionError("เกิดข้อผิดพลาดระหว่างโหลดหมวดเมนู");
        } finally {
            setLoading(false);
        }
    }

    async function handleAdd() {
        const name = input.trim();
        if (!name) {
            setActionError("กรุณากรอกชื่อหมวดเมนู");
            return;
        }

        setActionError("");
        try {
            const res = await fetch("/api/menu/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            if (!res.ok) {
                const msg = await readApiError(res, "เพิ่มหมวดเมนูไม่สำเร็จ");
                setActionError(msg);
                return;
            }

            setInput("");
            await loadCategories();
            onAdded?.();
        } catch (err) {
            void err;
            setActionError("เกิดข้อผิดพลาดระหว่างเพิ่มหมวดเมนู");
        }
    }

    async function handleSaveEdit(id: string) {
        const name = editingValue.trim();
        if (!name) {
            setActionError("กรุณากรอกชื่อหมวดเมนู");
            return;
        }

        setActionError("");
        try {
            const res = await fetch("/api/menu/categories", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name }),
            });

            if (!res.ok) {
                const msg = await readApiError(res, "แก้ไขหมวดเมนูไม่สำเร็จ");
                setActionError(msg);
                return;
            }

            setEditingId(null);
            setEditingValue("");
            await loadCategories();
            onAdded?.();
        } catch (err) {
            void err;
            setActionError("เกิดข้อผิดพลาดระหว่างแก้ไขหมวดเมนู");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("ลบหมวดเมนูนี้?")) return;

        setActionError("");
        try {
            const res = await fetch(`/api/menu/categories?id=${id}`, { method: "DELETE" });

            if (!res.ok) {
                const msg = await readApiError(res, "ลบหมวดเมนูไม่สำเร็จ");
                setActionError(msg);
                return;
            }

            if (editingId === id) {
                setEditingId(null);
                setEditingValue("");
            }

            await loadCategories();
            onAdded?.();
        } catch (err) {
            void err;
            setActionError("เกิดข้อผิดพลาดระหว่างลบหมวดเมนู");
        }
    }

    useEffect(() => {
        if (!isOpen) return;

        setFilter("");
        setInput("");
        setActionError("");
        setEditingId(null);
        setEditingValue("");
        void loadCategories();
    }, [isOpen]);

    const filtered = useMemo(
        () => items.filter((it) => it.name.toLowerCase().includes(filter.toLowerCase())),
        [items, filter]
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="จัดการหมวดเมนู">
            <div className="max-w-xl w-full">
                <div className="flex gap-2 mb-3">
                    <input
                        className="flex-1 p-2 border rounded bg-transparent"
                        placeholder="เพิ่มหมวดเมนูใหม่..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAdd();
                        }}
                    />
                    <Button onClick={() => void handleAdd()}>เพิ่ม</Button>
                </div>

                <div className="mb-3">
                    <input
                        className="w-full p-2 border rounded bg-transparent"
                        placeholder="ค้นหาหมวดเมนู..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>

                {actionError && (
                    <div className="mb-3 rounded border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                        {actionError}
                    </div>
                )}

                <div className="border rounded p-2 max-h-[360px] overflow-auto">
                    {loading ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">กำลังโหลด...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">ยังไม่มีหมวดเมนู</div>
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
                                                if (e.key === "Enter") void handleSaveEdit(cat.id);
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
                                                onClick={() => void handleSaveEdit(cat.id)}
                                            >
                                                บันทึก
                                            </button>
                                            <button
                                                className="text-sm text-gray-400 hover:underline"
                                                onClick={() => {
                                                    setEditingId(null);
                                                    setEditingValue("");
                                                }}
                                            >
                                                ยกเลิก
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="text-sm text-blue-500 hover:underline"
                                                onClick={() => {
                                                    setActionError("");
                                                    setEditingId(cat.id);
                                                    setEditingValue(cat.name);
                                                }}
                                            >
                                                แก้ไข
                                            </button>
                                            <button
                                                className="text-sm text-red-500 hover:underline"
                                                onClick={() => void handleDelete(cat.id)}
                                            >
                                                ลบ
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-3 text-xs text-[var(--text-secondary)]">
                    ค้นหาเพื่อกรองรายการ กดแก้ไขเพื่อเปลี่ยนชื่อ แล้วกด Enter เพื่อบันทึก
                </div>
            </div>
        </Modal>
    );
}
