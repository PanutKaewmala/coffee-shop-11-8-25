"use client";

import { useState } from "react";

type AdjustType = "increase" | "decrease" | "set";

interface AdjustStockFormProps {
    ingredient: {
        id: string;
        name: string;
        stock: number;
        unit: string;
    };
    onClose: () => void;
    onUpdated?: () => void;
}

export default function AdjustStockForm({
    ingredient,
    onClose,
    onUpdated,
}: AdjustStockFormProps) {
    const [adjustType, setAdjustType] = useState<AdjustType>("increase");
    const [amount, setAmount] = useState<string>("");   // ⭐ คุมด้วย string ปลอดภัยกว่า
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);

    // -----------------------------------------
    // จำนวนที่นำไปคำนวณ → number แบบ safety
    // -----------------------------------------
    function parseAmount(): number | null {
        if (amount.trim() === "") return null;

        const numeric = Number(amount);
        if (!isFinite(numeric) || isNaN(numeric)) return null;

        return numeric;
    }

    // -----------------------------------------
    // คำนวณ diff
    // -----------------------------------------
    function computeDiff(): number | null {
        const numeric = parseAmount();
        if (numeric === null) return null;

        if (adjustType === "increase") return Math.abs(numeric);

        if (adjustType === "decrease") return -Math.abs(numeric);

        if (adjustType === "set") return numeric - ingredient.stock;

        return null;
    }

    // -----------------------------------------
    // Validate
    // -----------------------------------------
    function validate(): boolean {
        const numeric = parseAmount();
        if (numeric === null) {
            alert("จำนวนไม่ถูกต้อง");
            return false;
        }

        if (adjustType !== "set" && numeric <= 0) {
            alert("กรุณากรอกจำนวนมากกว่า 0");
            return false;
        }

        if (adjustType === "set" && numeric < 0) {
            alert("สต็อกใหม่ต้องเป็นเลข 0 ขึ้นไป");
            return false;
        }

        return true;
    }

    // -----------------------------------------
    // ส่งข้อมูล
    // -----------------------------------------
    async function submit() {
        if (loading) return; // กันดับเบิ้ลคลิก
        if (!validate()) return;

        const diff = computeDiff();
        if (diff === null) {
            alert("จำนวนไม่ถูกต้อง");
            return;
        }

        try {
            setLoading(true);

            const res = await fetch("/api/ingredients/adjust", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ingredient_id: ingredient.id,
                    diff,
                    type: adjustType,
                    note,
                }),
            });

            let data: Record<string, unknown> | null = null;

            try {
                data = await res.json();
            } catch {
                alert("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
                return;
            }

            if (!res.ok) {
                const msg = typeof data?.error === "string" ? data.error : "ปรับสต็อกไม่สำเร็จ";
                alert(msg);
                return;
            }

            onUpdated?.();
            onClose();
        } catch (err) {
            console.error("Adjust error:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            setLoading(false);
        }
    }

    // -----------------------------------------
    // UI
    // -----------------------------------------
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-surface p-6 rounded-2xl w-[380px] shadow-xl border border-[var(--text-muted)]/20">

                <h2 className="text-xl font-bold text-text-primary mb-4">
                    ปรับสต๊อก: {ingredient.name}
                </h2>

                <div className="mb-3 text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">ยอดคงเหลือเดิม:</span>{" "}
                    <span className="text-text-secondary">{ingredient.stock} {ingredient.unit}</span>
                </div>

                <div className="mb-3">
                    <label className="text-sm text-text-secondary">ประเภทการปรับ</label>
                    <select
                        className="w-full mt-1 p-2 rounded-md bg-background border border-[var(--text-muted)]/20"
                        value={adjustType}
                        onChange={(e) => {
                            setAdjustType(e.target.value as AdjustType);
                            setAmount("");
                        }}
                    >
                        <option value="increase">เพิ่มสต็อก</option>
                        <option value="decrease">ลดสต็อก</option>
                        <option value="set">ตั้งค่ายอดใหม่</option>
                    </select>
                </div>

                <div className="mb-3">
                    <label className="text-sm text-text-secondary">
                        {adjustType === "set"
                            ? `ยอดใหม่ทั้งหมด (${ingredient.unit})`
                            : `จำนวนที่ต้องการปรับ (${ingredient.unit})`}
                    </label>

                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full mt-1 p-2 rounded-md bg-background border border-[var(--text-muted)]/20"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={adjustType === "set" ? "ตัวอย่าง: 450" : "ตัวอย่าง: 20"}
                    />
                </div>

                <div className="mb-4">
                    <label className="text-sm text-text-secondary">หมายเหตุ (ถ้ามี)</label>
                    <input
                        type="text"
                        className="w-full mt-1 p-2 rounded-md bg-background border border-[var(--text-muted)]/20"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="เช่น ตรวจของเสียรอบเช้า"
                    />
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-[var(--text-muted)]/20 text-text-secondary hover:bg-[var(--text-muted)]/30"
                    >
                        ยกเลิก
                    </button>

                    <button
                        onClick={submit}
                        disabled={loading}
                        className="px-5 py-2 rounded-lg bg-accent text-white font-bold hover:bg-accent-dark active:scale-[0.97] disabled:opacity-50"
                    >
                        {loading ? "กำลังบันทึก..." : "บันทึก"}
                    </button>
                </div>
            </div>
        </div>
    );
}
