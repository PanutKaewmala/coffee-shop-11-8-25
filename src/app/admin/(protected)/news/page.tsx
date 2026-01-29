"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";
import SearchBox from "@/components/admin/search/SearchBox";
import Pagination from "@/components/admin/Pagination";
import type { NewsItem } from "@/lib/types";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";

/* =========================
   Helpers (NO any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function asString(v: unknown): string {
    return typeof v === "string" ? v : "";
}
function extractArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}
function normalizeCat(v: unknown): string {
    return asString(v).trim();
}
function normalizeCatKey(v: unknown): string {
    return normalizeCat(v).toLowerCase();
}
function toISOFromDateInput(dateStr: string): string {
    // input type="date" => "YYYY-MM-DD"
    // ทำเป็น ISO แบบกลางๆ (UTC midnight) กัน timezone พัง
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    return d.toISOString();
}

type NewsFormErrors = Partial<{
    category: string;
    title: string;
    event_date: string;
}>;

type NewsWritePayload = {
    category: string;
    title: string;
    event_date: string; // ISO
    content: string | null;
    image: string | null; // image_url
};

export default function NewsAdminPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);

    // manual categories used for news form
    const [categories, setCategories] = useState<string[]>([
        "ร้านแจ้งข่าว",
        "โปรโมชั่น",
        "เมนูใหม่",
        "กิจกรรมในร้าน",
        "ประกาศสำคัญ",
    ]);

    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [newCategory, setNewCategory] = useState("");

    // News modal
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<NewsItem | null>(null);

    const [category, setCategory] = useState("");
    const [title, setTitle] = useState("");
    const [date, setDate] = useState(""); // YYYY-MM-DD
    const [content, setContent] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<NewsFormErrors>({});

    // Filters / pagination
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");

    const [page, setPage] = useState(1);
    const [inputPage, setInputPage] = useState("");
    const rowsPerPage = 20;

    // recipes-style dropdown
    const [moreOpen, setMoreOpen] = useState(false);
    const [moreQuery, setMoreQuery] = useState("");
    const moreRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setInputPage(String(page));
    }, [page]);

    /* -------------------------
       Fetch news
    ------------------------- */
    const fetchNews = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/news", { cache: "no-store" });
            const raw: unknown = await res.json().catch(() => []);

            // รองรับทั้ง [] และ {news:[...]}
            const list = Array.isArray(raw)
                ? extractArray<NewsItem>(raw)
                : isRecord(raw) && Array.isArray(raw.news)
                    ? extractArray<NewsItem>(raw.news)
                    : [];

            setNews(list);
        } catch (err) {
            console.error("Fetch News Error:", err);
            setNews([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // กัน warning แปลกๆ เรื่อง sync effect (เผื่อเครื่องเตือน)
        queueMicrotask(() => {
            void fetchNews();
        });
    }, []);

    /* -------------------------
       Categories for filter (derive from news)
    ------------------------- */
    const categoryOptions = useMemo(() => {
        const cleaned = news
            .map((i) => normalizeCat(i.category))
            .filter(Boolean);

        const uniqKeys = Array.from(new Set(cleaned.map((c) => c.toLowerCase())));
        const final = uniqKeys.map((k) => cleaned.find((c) => c.toLowerCase() === k) ?? k);
        return ["all", ...final];
    }, [news]);

    const categoryList = useMemo(() => categoryOptions.slice(1), [categoryOptions]); // remove all
    const visibleCategories = useMemo(() => categoryList.slice(0, 6), [categoryList]);

    const moreList = useMemo(() => {
        const q = moreQuery.trim().toLowerCase();
        return categoryList
            .filter((c) => !visibleCategories.includes(c))
            .filter((c) => c.toLowerCase().includes(q));
    }, [categoryList, visibleCategories, moreQuery]);

    // click outside for dropdown
    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setMoreOpen(false);
            }
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    /* -------------------------
       Filtering
    ------------------------- */
    const filteredItems = useMemo(() => {
        const s = search.trim().toLowerCase();
        const filterKey = categoryFilter === "all" ? "all" : normalizeCatKey(categoryFilter);

        return news.filter((item) => {
            const t = asString(item.title).toLowerCase();
            const c = asString(item.content).toLowerCase();
            const catKey = normalizeCatKey(item.category);

            const matchSearch =
                !s ? true : t.includes(s) || c.includes(s) || catKey.includes(s);

            const matchCategory =
                filterKey === "all" ? true : catKey === filterKey;

            return matchSearch && matchCategory;
        });
    }, [news, search, categoryFilter]);

    /* -------------------------
       Pagination
    ------------------------- */
    const totalPages = Math.ceil(filteredItems.length / rowsPerPage) || 1;

    const paginatedItems = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredItems.slice(start, start + rowsPerPage);
    }, [filteredItems, page]);

    useEffect(() => {
        setPage(1);
    }, [search, categoryFilter]);

    /* -------------------------
       Reset / Open / Close
    ------------------------- */
    const resetForm = () => {
        setCategory("");
        setTitle("");
        setDate("");
        setContent("");
        setImageFile(null);
        setImagePreview(null);
        setErrors({});
        setEditingItem(null);
    };

    const openModal = (item?: NewsItem) => {
        resetForm();

        if (item) {
            setEditingItem(item);
            setCategory(normalizeCat(item.category));
            setTitle(asString(item.title));
            setContent(asString(item.content));
            // event_date เป็น string (มักเป็น ISO) -> เอาแค่ YYYY-MM-DD
            const ed = asString((item as unknown as { event_date?: unknown }).event_date);
            setDate(ed ? ed.split("T")[0] : "");
            setImagePreview(asString(item.image_url) || null);
        } else {
            const t = new Date();
            const y = t.getFullYear();
            const m = String(t.getMonth() + 1).padStart(2, "0");
            const d = String(t.getDate()).padStart(2, "0");
            setDate(`${y}-${m}-${d}`);
        }

        setShowModal(true);
    };

    const closeModal = () => {
        if (saving) return;
        setShowModal(false);
        resetForm();
    };

    /* -------------------------
       Image preview
    ------------------------- */
    useEffect(() => {
        if (!imageFile) return;
        const url = URL.createObjectURL(imageFile);
        setImagePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    const handleImageChange = (file: File | null) => {
        setImageFile(file);
        if (!file) setImagePreview(null);
    };

    /* -------------------------
       Validate
    ------------------------- */
    const validate = (): boolean => {
        const e: NewsFormErrors = {};

        if (!normalizeCat(category)) e.category = "จำเป็นต้องเลือกหมวดหมู่";
        if (!title.trim()) e.title = "จำเป็นต้องใส่ชื่อหัวข้อข่าว";
        if (!date.trim()) e.event_date = "จำเป็นต้องเลือกวันที่";

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    /* -------------------------
       Upload image
    ------------------------- */
    const uploadImageIfNeeded = async (): Promise<string | null> => {
        if (!imageFile) return editingItem?.image_url ?? null;

        const fd = new FormData();
        fd.append("files", imageFile);

        try {
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data: unknown = await res.json().catch(() => ({}));

            // รองรับ { urls: string[] } หรือ { url: string }
            if (isRecord(data)) {
                if (Array.isArray(data.urls) && typeof data.urls[0] === "string") return data.urls[0];
                if (typeof data.url === "string") return data.url;
            }

            return null;
        } catch (err) {
            console.error("Upload error:", err);
            return null;
        }
    };

    /* -------------------------
       Save
    ------------------------- */
    const saveNews = async () => {
        if (!validate()) return;

        setSaving(true);
        try {
            const imageUrl = await uploadImageIfNeeded();

            const payload: NewsWritePayload = {
                category: normalizeCat(category),
                title: title.trim(),
                event_date: toISOFromDateInput(date),
                content: content.trim() ? content.trim() : null,
                image: imageUrl ?? null,
            };

            const isEdit = Boolean(editingItem?.id);
            const res = await fetch("/api/news", {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isEdit ? { ...payload, id: editingItem!.id } : payload),
            });

            if (!res.ok) {
                const raw = await res.text().catch(() => "");
                console.error("Save news failed:", res.status, raw);
                alert("บันทึกข่าวไม่สำเร็จ");
                return;
            }

            await fetchNews();
            closeModal();
        } catch (err) {
            console.error("Save News Error:", err);
            alert("บันทึกข่าวไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    };

    /* -------------------------
       Delete
    ------------------------- */
    const deleteNews = async (id: string) => {
        if (!confirm("ต้องการลบข่าวนี้?")) return;

        const res = await fetch(`/api/news?id=${id}`, { method: "DELETE" });
        if (!res.ok) {
            const raw = await res.text().catch(() => "");
            console.error("Delete news failed:", res.status, raw);
            alert("ลบไม่สำเร็จ");
            return;
        }
        void fetchNews();
    };

    const headers = [
        "Category",
        "Title",
        "Content",
        "Image",
        "Created At",
        "Event Date",
        "Actions",
    ];

    return (
        <div className="p-6 space-y-6">
            <Card title="News">
                {/* === FILTER === */}
                <div className="mb-4 space-y-3">
                    <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาข่าว..." />

                    {/* category filter (recipes style) */}
                    <div className="flex items-center justify-between gap-4">
                        {/* scroll chips */}
                        <div className="flex-1 min-w-0">
                            <div className="relative">
                                <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none gradient-left" />

                                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-2">
                                    {/* ALL */}
                                    <button
                                        onClick={() => setCategoryFilter("all")}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${categoryFilter === "all"
                                                ? "bg-[var(--accent)] text-black"
                                                : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                            }`}
                                    >
                                        ทั้งหมด
                                    </button>

                                    {/* visible categories */}
                                    {visibleCategories.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => setCategoryFilter(c)}
                                            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${normalizeCatKey(categoryFilter) === normalizeCatKey(c)
                                                    ? "bg-[var(--accent)] text-black"
                                                    : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                                }`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>

                                <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none gradient-right" />
                            </div>
                        </div>

                        {/* MORE dropdown */}
                        <div className="relative" ref={moreRef}>
                            <button
                                onClick={() => {
                                    setMoreOpen((s) => !s);
                                    setMoreQuery("");
                                }}
                                className="ml-2 px-3 py-1.5 rounded-lg bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-black"
                            >
                                More ▾
                            </button>

                            {moreOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-[var(--surface)] border rounded-lg shadow-lg z-50 p-3">
                                    <input
                                        className="w-full p-2 rounded-md mb-2 bg-background border border-text-muted/40"
                                        placeholder="ค้นหาหมวดหมู่..."
                                        value={moreQuery}
                                        onChange={(e) => setMoreQuery(e.target.value)}
                                    />

                                    <div className="max-h-56 overflow-auto">
                                        {moreList.length === 0 ? (
                                            <div className="text-sm text-[var(--text-secondary)] p-2">
                                                ไม่พบหมวดหมู่
                                            </div>
                                        ) : (
                                            moreList.map((c) => (
                                                <div key={c} className="p-2 hover:bg-[var(--background)] rounded">
                                                    <button
                                                        className="text-sm text-left w-full"
                                                        onClick={() => {
                                                            setCategoryFilter(c);
                                                            setMoreOpen(false);
                                                        }}
                                                    >
                                                        {c}
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ADD BUTTON */}
                <div className="flex justify-end mb-4">
                    <Button onClick={() => openModal()}>+ Add News</Button>
                </div>

                {/* TABLE */}
                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <Table
                        headers={headers}
                        data={paginatedItems.map((item) => [
                            normalizeCat(item.category) || "-",
                            asString(item.title) || "-",
                            asString(item.content)
                                ? asString(item.content).slice(0, 60) + "..."
                                : "-",
                            asString(item.image_url) ? (
                                <img
                                    key={item.id + "_img"}
                                    src={asString(item.image_url)}
                                    alt={asString(item.title) || "news"}
                                    className="w-16 h-16 object-cover rounded"
                                />
                            ) : (
                                "-"
                            ),
                            asString(item.created_at)
                                ? new Date(asString(item.created_at)).toLocaleDateString("th-TH")
                                : "-",
                            asString((item as unknown as { event_date?: unknown }).event_date)
                                ? new Date(
                                    asString((item as unknown as { event_date?: unknown }).event_date)
                                ).toLocaleDateString("th-TH")
                                : "-",
                            <div key={item.id + "_actions"} className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => openModal(item)}>
                                    Edit
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void deleteNews(item.id)}
                                >
                                    Delete
                                </Button>
                            </div>,
                        ])}
                    />
                )}

                {/* PAGINATION */}
                <Pagination
                    page={page}
                    setPage={setPage}
                    totalPages={totalPages}
                    inputPage={inputPage}
                    setInputPage={setInputPage}
                />
            </Card>

            {/* MODAL ADD/EDIT NEWS */}
            {showModal && (
                <Modal
                    isOpen={showModal}
                    onClose={closeModal}
                    title={editingItem ? "Edit News" : "Add News"}
                >
                    <div className="space-y-5 max-w-md">
                        {/* CATEGORY */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Category <span className="text-red-500">*</span>
                            </label>

                            <div className="flex gap-2 items-center">
                                <div className="flex-1">
                                    <Select value={category} onValueChange={(v) => setCategory(v)}>
                                        <SelectTrigger className="w-full bg-transparent">
                                            <SelectValue placeholder="เลือกหมวดหมู่" />
                                        </SelectTrigger>

                                        <SelectContent>
                                            {categories.map((c) => (
                                                <SelectItem key={c} value={c}>
                                                    {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={() => setShowCategoryModal(true)}
                                    className="whitespace-nowrap"
                                >
                                    + Add
                                </Button>
                            </div>

                            {errors.category && (
                                <p className="text-xs text-red-400 mt-1">{errors.category}</p>
                            )}
                        </div>

                        {/* TITLE */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="หัวข้อข่าว"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full border rounded-md p-2 bg-transparent"
                            />
                            {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
                        </div>

                        {/* CONTENT */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Content (optional)
                            </label>
                            <textarea
                                placeholder="รายละเอียดข่าว"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full border rounded-md p-2 bg-transparent min-h-[120px]"
                            />
                        </div>

                        {/* DATE */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Event Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full border rounded-md p-2 bg-transparent"
                            />
                            {errors.event_date && (
                                <p className="text-xs text-red-400 mt-1">{errors.event_date}</p>
                            )}
                        </div>

                        {/* IMAGE */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Image (optional)
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                            />

                            {imagePreview && (
                                <div className="mt-2">
                                    <img
                                        src={imagePreview}
                                        alt="preview"
                                        className="w-32 h-32 object-cover rounded"
                                    />
                                </div>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeModal} disabled={saving}>
                                Cancel
                            </Button>

                            <Button onClick={() => void saveNews()} disabled={saving}>
                                {saving
                                    ? editingItem
                                        ? "Updating..."
                                        : "Adding..."
                                    : editingItem
                                        ? "Update"
                                        : "Add"}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* CATEGORY MODAL */}
            {showCategoryModal && (
                <Modal
                    isOpen={showCategoryModal}
                    onClose={() => {
                        setShowCategoryModal(false);
                        setNewCategory("");
                    }}
                    title="Add Category"
                >
                    <div className="space-y-4 max-w-md">
                        <input
                            type="text"
                            placeholder="Category name"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            className="w-full border rounded-md p-2 bg-transparent"
                        />

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowCategoryModal(false);
                                    setNewCategory("");
                                }}
                            >
                                Cancel
                            </Button>

                            <Button
                                onClick={() => {
                                    const v = newCategory.trim();
                                    if (!v) return alert("กรุณากรอกชื่อหมวดหมู่");

                                    // กันซ้ำแบบไม่สนตัวพิมพ์
                                    const exists = categories.some((c) => c.trim().toLowerCase() === v.toLowerCase());
                                    if (exists) return alert("หมวดหมู่นี้มีอยู่แล้ว");

                                    setCategories((prev) => [...prev, v]);
                                    setCategory(v);
                                    setShowCategoryModal(false);
                                    setNewCategory("");
                                }}
                            >
                                Add
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
