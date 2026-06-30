"use client";

import React, { useMemo, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";
import { BASE_UNIT_LABEL } from "@/lib/units";

type BaseUnit = "ml" | "g" | "piece";

export type AdjustStockIngredient = {
    id: string;
    name: string;
    stock: number;

    // ✅ ไม่บังคับแล้ว (กันพังเวลาส่งมาจาก type ที่ยังไม่ update)
    unit?: string | null;

    // ✅ เผื่อระบบมี base_unit เป็นหลัก
    base_unit?: BaseUnit | string | null;
};

type Props = {
    ingredient: AdjustStockIngredient;
    onClose: () => void;
    onUpdated: () => void;
};

type Reason = "in" | "waste" | "count"; // รับของเข้า | ของเสีย/ทิ้ง | นับสต็อก

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clampMin0(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
}

function formatInt(n: number): string {
    return String(Math.round(n));
}

function normUnit(s: string): string {
    return s.trim().toLowerCase();
}

function baseUnitFromText(u: string): BaseUnit | null {
    const s = normUnit(u);
    if (["ml", "มล.", "มล", "milliliter", "milliliters"].includes(s)) return "ml";
    if (["g", "กรัม", "กร", "gram", "grams"].includes(s)) return "g";
    if (["piece", "pcs", "ชิ้น", "อัน", "unit"].includes(s)) return "piece";
    return null;
}

function pickUnitLabel(ing: AdjustStockIngredient): string {
    const unit = typeof ing.unit === "string" ? ing.unit.trim() : "";
    if (unit) return unit;

    const buRaw = ing.base_unit;
    if (buRaw === "ml" || buRaw === "g" || buRaw === "piece") {
        return BASE_UNIT_LABEL[buRaw];
    }
    if (typeof buRaw === "string") {
        const parsed = baseUnitFromText(buRaw);
        if (parsed) return BASE_UNIT_LABEL[parsed];
    }

    // สุดท้ายจริงๆ
    return "";
}

function getBackendMessage(data: unknown): { code: string | null; message: string | null } {
    if (typeof data !== "object" || data === null) return { code: null, message: null };
    const record = data as Record<string, unknown>;
    return {
        code: typeof record.code === "string" ? record.code : null,
        message: typeof record.error === "string" ? record.error : null,
    };
}

export default function AdjustStockForm({ ingredient, onClose, onUpdated }: Props) {
    const [reason, setReason] = useState<Reason>("in");
    const [amountText, setAmountText] = useState<string>("");
    const [note, setNote] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const curStock = useMemo(() => clampMin0(toNumber(ingredient.stock, 0)), [ingredient.stock]);

    const unitLabel = useMemo(() => pickUnitLabel(ingredient), [ingredient]);

    const parsedAmount = useMemo(() => {
        // รับ decimal ได้ แต่สุดท้ายเราปัดตอนแสดง
        const raw = amountText.trim();
        if (!raw) return 0;
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }, [amountText]);

    const preview = useMemo(() => {
        const amt = clampMin0(parsedAmount);

        if (reason === "count") {
            // นับสต็อก = set to value
            return amt;
        }
        if (reason === "in") {
            // รับของเข้า = +amount
            return curStock + amt;
        }
        // ของเสีย/ทิ้ง = -amount
        return Math.max(0, curStock - amt);
    }, [reason, parsedAmount, curStock]);

    const helperText = useMemo(() => {
        if (reason === "in") return "รับของเข้าสต็อก เช่น ซื้อมาใหม่ / เติมของ";
        if (reason === "waste") return "ของเสีย/ทิ้ง/หมดอายุ เช่น ทำหก / เสียหาย";
        return "นับสต็อกจริงแล้วตั้งให้ตรง (ระบบจะคำนวณส่วนต่างให้)";
    }, [reason]);

    async function submit() {
        if (saving) return;
        setErr(null);

        const amt = clampMin0(parsedAmount);

        if (reason !== "count" && amt <= 0) {
            setErr("กรุณาใส่จำนวนมากกว่า 0");
            return;
        }
        if (reason === "count" && amt < 0) {
            setErr("จำนวนสต็อกต้องไม่ติดลบ");
            return;
        }

        // API รับ amount เป็น “diff signed”
        const diff = reason === "count" ? amt - curStock : reason === "in" ? amt : -amt;

        if (diff === 0) {
            setErr("ไม่มีการเปลี่ยนแปลง (จำนวนเท่าเดิม)");
            return;
        }

        try {
            setSaving(true);

            const res = await fetch("/api/ingredients/adjust", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                    ingredient_id: ingredient.id,
                    amount: diff,
                    reason,
                    note: note.trim() || null,
                }),
            });

            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                const backend = getBackendMessage(data);
                if (backend.code === "BUSINESS_DAY_CLOSED" || backend.message?.includes("ปิดยอด")) {
                    setErr("วันนี้ปิดยอดแล้ว — ไม่สามารถเพิ่มหรือปรับสต็อกของวันนี้ได้");
                    return;
                }

                setErr(backend.message ?? "ปรับสต็อกไม่สำเร็จ");
                return;
            }

            onUpdated();
            onClose();
        } catch {
            setErr("เชื่อมต่อไม่สำเร็จ ลองใหม่");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal isOpen onClose={saving ? () => { } : onClose} title="ปรับสต็อก">
            <div className="space-y-4">
                {/* header ingredient */}
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="text-sm text-[var(--text-secondary)]">วัตถุดิบ</div>
                    <div className="text-lg font-semibold truncate">{ingredient.name}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        ตอนนี้:{" "}
                        <span className="text-[var(--text)] font-semibold">{formatInt(curStock)}</span>{" "}
                        {unitLabel}
                    </div>
                </div>

                {/* reason tabs */}
                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setReason("in")}
                        className={`px-3 py-2 rounded-lg border border-white/10 text-sm ${reason === "in" ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                    >
                        รับของเข้า
                    </button>
                    <button
                        type="button"
                        onClick={() => setReason("waste")}
                        className={`px-3 py-2 rounded-lg border border-white/10 text-sm ${reason === "waste" ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                    >
                        ของเสีย/ทิ้ง
                    </button>
                    <button
                        type="button"
                        onClick={() => setReason("count")}
                        className={`px-3 py-2 rounded-lg border border-white/10 text-sm ${reason === "count" ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                    >
                        นับสต็อก
                    </button>
                </div>

                <div className="text-xs text-[var(--text-secondary)] -mt-1">{helperText}</div>

                {/* amount */}
                <div>
                    <label className="text-xs text-[var(--text-secondary)]">
                        {reason === "count" ? "ตั้งคงเหลือเป็น" : "จำนวน"}
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                        <input
                            value={amountText}
                            onChange={(e) => setAmountText(e.target.value)}
                            inputMode="decimal"
                            placeholder={reason === "count" ? "เช่น 1200" : "เช่น 200"}
                            className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/20 outline-none"
                            disabled={saving}
                        />
                        <div className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
                            {unitLabel}
                        </div>
                    </div>

                    <div className="mt-2 text-xs text-[var(--text-secondary)]">
                        หลังปรับ:{" "}
                        <span className="text-[var(--text)] font-semibold">{formatInt(preview)}</span>{" "}
                        {unitLabel}
                    </div>
                </div>

                {/* note */}
                <div>
                    <label className="text-xs text-[var(--text-secondary)]">หมายเหตุ (ไม่บังคับ)</label>
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="เช่น รับของจากซัพพลายเออร์ / ทิ้งของหมดอายุ / นับของจริง"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-white/10 bg-black/20 outline-none"
                        disabled={saving}
                    />
                </div>

                {/* error */}
                {err && (
                    <div className="text-sm rounded-lg border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300 px-3 py-2">
                        {err}
                    </div>
                )}

                {/* footer */}
                <div className="flex items-center justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        ยกเลิก
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? "กำลังบันทึก..." : "บันทึก"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
