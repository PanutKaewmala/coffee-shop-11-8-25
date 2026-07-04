"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";

import type { MenuItem, ServeTypeWithDefault } from "@/lib/types";

type MenuFormErrors = Partial<{
    category: string;
    name: string;
    price: string;
    serveTypes: string;
    servePricing: string;
}>;

type ServePricingRow = {
    serveType: string; // name in DB
    price_override: number | null; // null = use base price
};

export type MenuFormSubmitPayload = {
    id?: string;
    name: string;
    price: number; // base price
    category: string;
    serveTypes: string[];
    servePricing: ServePricingRow[]; // ✅ NEW
    description: string;
    imageFile: File | null;
};

interface MenuFormModalProps {
    isOpen: boolean;
    onClose: () => void;

    /** edit mode */
    initialValues?: MenuItem | null;

    categories: string[];
    serveTypesDB: string[];

    onOpenCategoryModal: () => void;
    onOpenServeModal: () => void;

    onSubmit: (payload: MenuFormSubmitPayload) => Promise<void>;
}

/* =========================
   Helpers
========================= */
function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && (v.length === 0 || typeof v[0] === "string");
}

function normalizeServeTypes(
    v: MenuItem["serve_types"] | undefined | null
): string[] {
    if (!v) return [];
    if (isStringArray(v)) return v;

    if (Array.isArray(v)) {
        const out: string[] = [];
        for (const it of v as ServeTypeWithDefault[]) {
            if (it && typeof it === "object" && typeof it.name === "string") out.push(it.name);
        }
        return out;
    }
    return [];
}

function uniqueStrings(arr: string[]) {
    return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

export default function MenuFormModal({
    isOpen,
    onClose,
    initialValues,
    categories,
    serveTypesDB,
    onOpenCategoryModal,
    onOpenServeModal,
    onSubmit,
}: MenuFormModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<MenuFormErrors>({});
    const [submitError, setSubmitError] = useState("");

    // ---- local states ----
    const [category, setCategory] = useState<string>("");
    const [name, setName] = useState<string>("");
    const [price, setPrice] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [serveTypes, setServeTypes] = useState<string[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);

    // ✅ serve override price controls (per serve name)
    const [serveOverrideOn, setServeOverrideOn] = useState<Record<string, boolean>>({});
    const [serveOverridePrice, setServeOverridePrice] = useState<Record<string, string>>({});

    // ---- sync initial values when open / switching edit target ----
    useEffect(() => {
        if (!isOpen) return;

        const serves = uniqueStrings(normalizeServeTypes(initialValues?.serve_types));
        setErrors({});
        setSubmitError("");

        setCategory((initialValues?.category ?? "") as string);
        setName(initialValues?.name ?? "");
        setPrice(
            initialValues?.price !== undefined && initialValues?.price !== null
                ? String(initialValues.price)
                : ""
        );
        setDescription(initialValues?.description ?? "");
        setServeTypes(serves);
        setImageFile(null);

        // reset override states (edit mode: start off = false)
        const onInit: Record<string, boolean> = {};
        const priceInit: Record<string, string> = {};
        for (const s of serves) {
            onInit[s] = false;
            priceInit[s] = "";
        }
        setServeOverrideOn(onInit);
        setServeOverridePrice(priceInit);
    }, [isOpen, initialValues]);

    // ---------- Category searchable ----------
    const [catQuery, setCatQuery] = useState("");
    const filteredCategories = useMemo(() => {
        const q = catQuery.trim().toLowerCase();
        if (!q) return categories;
        return categories.filter((c) => c.toLowerCase().includes(q));
    }, [catQuery, categories]);

    // ---------- Serve types searchable ----------
    const [serveQuery, setServeQuery] = useState("");
    const filteredServeTypes = useMemo(() => {
        const q = serveQuery.trim().toLowerCase();
        if (!q) return serveTypesDB;
        return serveTypesDB.filter((s) => s.toLowerCase().includes(q));
    }, [serveQuery, serveTypesDB]);

    const selectedCount = serveTypes.length;

    const toggleServe = (opt: string) => {
        setServeTypes((prev) => {
            const exists = prev.includes(opt);
            const next = exists ? prev.filter((x) => x !== opt) : uniqueStrings([...prev, opt]);

            // keep pricing state sane
            setServeOverrideOn((p) => {
                const n = { ...p };
                if (!exists) {
                    if (n[opt] === undefined) n[opt] = false;
                } else {
                    delete n[opt];
                }
                return n;
            });

            setServeOverridePrice((p) => {
                const n = { ...p };
                if (!exists) {
                    if (n[opt] === undefined) n[opt] = "";
                } else {
                    delete n[opt];
                }
                return n;
            });

            return next;
        });
    };

    const clearServe = () => {
        setServeTypes([]);
        setServeOverrideOn({});
        setServeOverridePrice({});
    };

    const selectAllFilteredServe = () => {
        setServeTypes((prev) => {
            const set = new Set(prev);
            for (const s of filteredServeTypes) set.add(s);
            const next = Array.from(set);

            setServeOverrideOn((p) => {
                const n = { ...p };
                for (const s of filteredServeTypes) if (n[s] === undefined) n[s] = false;
                return n;
            });

            setServeOverridePrice((p) => {
                const n = { ...p };
                for (const s of filteredServeTypes) if (n[s] === undefined) n[s] = "";
                return n;
            });

            return next;
        });
    };

    const validate = (): MenuFormErrors => {
        const next: MenuFormErrors = {};
        const base = Number(price);

        if (!category.trim()) next.category = "กรุณาเลือกหมวดหมู่";
        if (!name.trim()) next.name = "กรุณากรอกชื่อเมนู";
        if (!price.trim() || Number.isNaN(base) || base <= 0) next.price = "กรุณากรอกราคาที่ถูกต้อง";
        if (serveTypes.length === 0) next.serveTypes = "เลือกอย่างน้อย 1 ประเภทเสิร์ฟ";

        // validate overrides (only when overrideOn = true)
        for (const s of serveTypes) {
            const on = !!serveOverrideOn[s];
            if (!on) continue;

            const v = (serveOverridePrice[s] ?? "").trim();
            const num = Number(v);

            if (!v || Number.isNaN(num) || num <= 0) {
                next.servePricing = "มีราคาที่ตั้งเฉพาะบางรายการไม่ถูกต้อง (ต้องเป็นเลขมากกว่า 0)";
                break;
            }
        }

        return next;
    };

    const buildServePricing = (): ServePricingRow[] => {
        const base = Number(price);
        const rows: ServePricingRow[] = [];

        for (const s of serveTypes) {
            const on = !!serveOverrideOn[s];

            if (!on) {
                rows.push({ serveType: s, price_override: null });
                continue;
            }

            const raw = (serveOverridePrice[s] ?? "").trim();
            const num = Number(raw);

            if (!raw || Number.isNaN(num) || num <= 0) {
                rows.push({ serveType: s, price_override: null });
            } else {
                rows.push({ serveType: s, price_override: num === base ? null : num });
            }
        }

        return rows;
    };

    const handleSubmit = async () => {
        const next = validate();
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const payload: MenuFormSubmitPayload = {
            id: initialValues?.id,
            name: name.trim(),
            price: Number(price),
            category: category.trim(),
            serveTypes: serveTypes.slice(),
            servePricing: buildServePricing(),
            description: description.trim(),
            imageFile,
        };

        setSubmitError("");
        try {
            setSubmitting(true);
            await onSubmit(payload);
            onClose();
        } catch (e: unknown) {
            setSubmitError(e instanceof Error ? e.message : "บันทึกเมนูไม่สำเร็จ");
        } finally {
            setSubmitting(false);
        }
    };

    const footer = (
        <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)]">
                {submitting ? "กำลังบันทึก..." : "ตรวจสอบข้อมูลก่อนบันทึก"}
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={submitting}>
                    ยกเลิก
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                    {initialValues ? "บันทึก" : "เพิ่ม"}
                </Button>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialValues ? "แก้ไขเมนู" : "เพิ่มเมนู"}
            footer={footer}
            maxWidthClassName="max-w-xl"
        >
            <div className="space-y-5">
                {submitError && (
                    <div className="rounded-md border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                        {submitError}
                    </div>
                )}
                {/* CATEGORY */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        หมวดเมนู <span className="text-red-500">*</span>
                    </label>

                    <div className="flex gap-2 items-start">
                        <div className="flex-1">
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="w-full bg-transparent">
                                    <SelectValue placeholder="เลือกหมวดหมู่" />
                                </SelectTrigger>

                                <SelectContent className="max-h-72 overflow-auto">
                                    <div className="p-2">
                                        <input
                                            value={catQuery}
                                            onChange={(e) => setCatQuery(e.target.value)}
                                            placeholder="ค้นหาหมวดหมู่..."
                                            className="w-full p-2 rounded-md bg-transparent border border-[var(--text-muted)]/40"
                                            onKeyDown={(e) => e.stopPropagation()}
                                        />
                                    </div>

                                    {filteredCategories.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
                                            ไม่พบหมวดหมู่
                                        </div>
                                    ) : (
                                        filteredCategories.map((c) => (
                                            <SelectItem key={c} value={c}>
                                                {c}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>

                            {errors.category && (
                                <p className="mt-1 text-xs text-red-500">{errors.category}</p>
                            )}
                        </div>

                        <Button variant="outline" onClick={onOpenCategoryModal} disabled={submitting}>
                            + เพิ่ม
                        </Button>
                    </div>
                </div>

                {/* NAME */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        ชื่อเมนู <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        placeholder="ชื่อเมนู"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full border rounded-md p-2 bg-transparent"
                        disabled={submitting}
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>

                {/* PRICE */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        ราคาพื้นฐาน <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="number"
                        placeholder="ราคา"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full border rounded-md p-2 bg-transparent"
                        disabled={submitting}
                    />
                    {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        ราคานี้เป็นราคาพื้นฐาน หากรูปแบบไหนไม่ได้ตั้งราคาเฉพาะ ระบบจะใช้ราคานี้
                    </p>
                </div>

                {/* SERVE TYPES */}
                <div>
                    <div className="flex items-end justify-between gap-3 mb-2">
                        <label className="block text-sm font-medium">
                            รูปแบบการขาย <span className="text-red-500">*</span>
                        </label>

                        <div className="text-xs text-[var(--text-muted)]">
                            เลือกแล้ว{" "}
                            <span className="text-[var(--text-primary)] font-semibold">
                                {selectedCount}
                            </span>{" "}
                            รายการ
                        </div>
                    </div>

                    <div className="flex gap-2 mb-2">
                        <input
                            value={serveQuery}
                            onChange={(e) => setServeQuery(e.target.value)}
                            placeholder="ค้นหารูปแบบการขาย..."
                            className="flex-1 p-2 rounded-md bg-transparent border border-[var(--text-muted)]/40"
                            disabled={submitting}
                        />
                        <Button
                            variant="outline"
                            onClick={clearServe}
                            disabled={submitting || serveTypes.length === 0}
                        >
                            ล้าง
                        </Button>
                        <Button
                            variant="outline"
                            onClick={selectAllFilteredServe}
                            disabled={submitting || filteredServeTypes.length === 0}
                        >
                            เลือกทั้งหมด
                        </Button>
                    </div>

                    {serveTypes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {serveTypes.slice(0, 12).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => toggleServe(s)}
                                    className="px-2 py-1 rounded-lg text-xs bg-[var(--surface)] border border-[var(--text-muted)]/30 hover:bg-[var(--background)]"
                                    disabled={submitting}
                                    title="คลิกเพื่อลบออก"
                                >
                                    {s} ✕
                                </button>
                            ))}
                            {serveTypes.length > 12 && (
                                <span className="text-xs text-[var(--text-muted)] self-center">
                                    +อีก {serveTypes.length - 12}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="border rounded-md p-3 bg-[var(--surface)] max-h-56 overflow-y-auto">
                        {filteredServeTypes.length === 0 ? (
                            <div className="text-sm text-[var(--text-muted)]">ไม่พบรูปแบบการขาย</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {filteredServeTypes.map((opt) => (
                                    <label
                                        key={opt}
                                        className="flex items-center gap-2 text-sm cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={serveTypes.includes(opt)}
                                            onChange={() => toggleServe(opt)}
                                            disabled={submitting}
                                        />
                                        <span className="truncate">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {errors.serveTypes && (
                        <p className="mt-1 text-xs text-red-500">{errors.serveTypes}</p>
                    )}

                    <Button
                        variant="outline"
                        className="mt-2"
                        onClick={onOpenServeModal}
                        disabled={submitting}
                    >
                        + เพิ่มรูปแบบการขาย
                    </Button>

                    {/* ✅ Serve pricing table */}
                    {serveTypes.length > 0 && (
                        <div className="mt-4">
                            <div className="text-sm font-medium mb-2">
                                ตั้งราคาแยกตามรูปแบบการขาย (ไม่บังคับ)
                            </div>

                            <div className="border rounded-md overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[var(--surface)] text-xs text-[var(--text-muted)]">
                                    <div className="col-span-4">รูปแบบ</div>
                                    <div className="col-span-3">ตั้งราคาเฉพาะ?</div>
                                    <div className="col-span-5">ราคาที่ตั้งเฉพาะ</div>
                                </div>

                                <div className="divide-y divide-[var(--text-muted)]/20">
                                    {serveTypes.map((s) => {
                                        const on = !!serveOverrideOn[s];
                                        return (
                                            <div
                                                key={s}
                                                className="grid grid-cols-12 gap-2 px-3 py-2 items-center"
                                            >
                                                <div className="col-span-4 text-sm truncate">{s}</div>

                                                <div className="col-span-3">
                                                    <label className="inline-flex items-center gap-2 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={on}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setServeOverrideOn((p) => ({
                                                                    ...p,
                                                                    [s]: checked,
                                                                }));
                                                                if (!checked) {
                                                                    setServeOverridePrice((p) => ({
                                                                        ...p,
                                                                        [s]: "",
                                                                    }));
                                                                }
                                                            }}
                                                            disabled={submitting}
                                                        />
                                                        <span className="text-[var(--text-muted)]">
                                                            ตั้งเอง
                                                        </span>
                                                    </label>
                                                </div>

                                                <div className="col-span-5">
                                                    <input
                                                        type="number"
                                                        value={serveOverridePrice[s] ?? ""}
                                                        onChange={(e) =>
                                                            setServeOverridePrice((p) => ({
                                                                ...p,
                                                                [s]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder={`ถ้าไม่ตั้งราคาเฉพาะ จะใช้ ${price || "ราคาพื้นฐาน"} บาท`}
                                                        disabled={submitting || !on}
                                                        className="w-full border rounded-md p-2 bg-transparent disabled:opacity-50"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {errors.servePricing && (
                                <p className="mt-1 text-xs text-red-500">{errors.servePricing}</p>
                            )}

                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                                สูตรและสต็อกจะผูกกับตัวเลือกของแต่ละรูปแบบการขาย ตั้งราคาให้ครบเพื่อให้หน้าขายแสดงถูกต้อง
                            </p>
                        </div>
                    )}
                </div>

                {/* DESCRIPTION */}
                <div>
                    <label className="block text-sm font-medium mb-1">รายละเอียด (ไม่บังคับ)</label>
                    <textarea
                        placeholder="รายละเอียดเมนู"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full border rounded-md p-2 bg-transparent min-h-[120px]"
                        disabled={submitting}
                    />
                </div>

                {/* IMAGE */}
                <div>
                    <label className="block text-sm font-medium mb-1">รูปภาพ (ไม่บังคับ)</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        disabled={submitting}
                    />
                    {imageFile && (
                        <div className="mt-2 text-xs text-[var(--text-muted)]">
                            เลือกไฟล์:{" "}
                            <span className="text-[var(--text-primary)]">{imageFile.name}</span>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
