"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onAdded?: () => void;
}

interface ServeRow {
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

export default function AddServeTypeModal({ isOpen, onClose, onAdded }: Props) {
    const [items, setItems] = useState<ServeRow[]>([]);
    const [filter, setFilter] = useState("");
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [actionError, setActionError] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState("");

    async function loadServeTypes() {
        try {
            setLoading(true);
            const res = await fetch("/api/menu/serves", { cache: "no-store" });
            if (!res.ok) {
                const msg = await readApiError(res, "Failed to load serve types");
                setActionError(msg);
                setItems([]);
                return;
            }

            const data: unknown = await res.json().catch(() => []);
            setItems(Array.isArray(data) ? (data as ServeRow[]) : []);
        } catch (err) {
            void err;
            setItems([]);
            setActionError("Unexpected error while loading serve types");
        } finally {
            setLoading(false);
        }
    }

    async function handleAdd() {
        const name = input.trim();
        if (!name) {
            setActionError("Please enter serve type name");
            return;
        }

        setActionError("");
        try {
            const res = await fetch("/api/menu/serves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            if (!res.ok) {
                const msg = await readApiError(res, "Failed to add serve type");
                setActionError(msg);
                return;
            }

            setInput("");
            await loadServeTypes();
            onAdded?.();
        } catch (err) {
            void err;
            setActionError("Unexpected error while adding serve type");
        }
    }

    async function handleSaveEdit(id: string) {
        const name = editingValue.trim();
        if (!name) {
            setActionError("Please enter serve type name");
            return;
        }

        setActionError("");
        try {
            const res = await fetch("/api/menu/serves", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name }),
            });

            if (!res.ok) {
                const msg = await readApiError(res, "Failed to update serve type");
                setActionError(msg);
                return;
            }

            setEditingId(null);
            setEditingValue("");
            await loadServeTypes();
            onAdded?.();
        } catch (err) {
            void err;
            setActionError("Unexpected error while updating serve type");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this serve type?")) return;

        setActionError("");
        try {
            const res = await fetch(`/api/menu/serves?id=${id}`, { method: "DELETE" });

            if (!res.ok) {
                const msg = await readApiError(res, "Failed to delete serve type");
                setActionError(msg);
                return;
            }

            if (editingId === id) {
                setEditingId(null);
                setEditingValue("");
            }

            await loadServeTypes();
            onAdded?.();
        } catch (err) {
            void err;
            setActionError("Unexpected error while deleting serve type");
        }
    }

    useEffect(() => {
        if (!isOpen) return;

        setFilter("");
        setInput("");
        setActionError("");
        setEditingId(null);
        setEditingValue("");
        void loadServeTypes();
    }, [isOpen]);

    const filtered = useMemo(
        () => items.filter((it) => it.name.toLowerCase().includes(filter.toLowerCase())),
        [items, filter]
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Serve Types">
            <div className="max-w-xl w-full">
                <div className="flex gap-2 mb-3">
                    <input
                        className="flex-1 p-2 border rounded bg-transparent"
                        placeholder="Add new serve type..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleAdd();
                        }}
                    />
                    <Button onClick={() => void handleAdd()}>Add</Button>
                </div>

                <div className="mb-3">
                    <input
                        className="w-full p-2 border rounded bg-transparent"
                        placeholder="Search..."
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
                        <div className="p-4 text-sm text-[var(--text-secondary)]">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-4 text-sm text-[var(--text-secondary)]">No serve types found</div>
                    ) : (
                        filtered.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 py-2 px-1 border-b last:border-b-0"
                            >
                                <div className="flex-1 min-w-0">
                                    {editingId === item.id ? (
                                        <input
                                            className="w-full p-2 border rounded bg-transparent"
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") void handleSaveEdit(item.id);
                                                if (e.key === "Escape") {
                                                    setEditingId(null);
                                                    setEditingValue("");
                                                }
                                            }}
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="truncate">{item.name}</div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {editingId === item.id ? (
                                        <>
                                            <button
                                                className="text-sm text-blue-500 hover:underline"
                                                onClick={() => void handleSaveEdit(item.id)}
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
                                                    setActionError("");
                                                    setEditingId(item.id);
                                                    setEditingValue(item.name);
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="text-sm text-red-500 hover:underline"
                                                onClick={() => void handleDelete(item.id)}
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
                    Search to filter list. Use Edit for inline rename and press Enter to save.
                </div>
            </div>
        </Modal>
    );
}
