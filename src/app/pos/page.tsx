"use client";

import { useEffect, useState } from "react";
import { OrderItem, MenuItem } from "@/lib/types";

export default function POSPage() {
    /* -------------------- STATE -------------------- */
    const [menu, setMenu] = useState<MenuItem[]>([]);
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(false);

    /* -------------------- LOAD MENU -------------------- */
    useEffect(() => {
        async function fetchMenu() {
            try {
                const res = await fetch("/api/menu");
                const data = await res.json();
                setMenu(data.menu || []);
            } catch (error) {
                console.error("โหลดเมนูล้มเหลว:", error);
            }
        }

        fetchMenu();
    }, []);

    /* -------------------- ADD TO CART -------------------- */
    function addToCart(item: MenuItem) {
        setCart((prev) => {
            const exists = prev.find((c) => c.id === item.id);

            if (exists) {
                return prev.map((c) =>
                    c.id === item.id ? { ...c, qty: c.qty + 1 } : c
                );
            }

            return [
                ...prev,
                {
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    qty: 1,
                },
            ];
        });
    }

    /* -------------------- UPDATE QTY -------------------- */
    function increaseQty(id: string) {
        setCart((prev) =>
            prev.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c))
        );
    }

    // ⭐️ ลดจำนวน - ถ้าเหลือ 0 ก็ลบออกเลย
    function decreaseQty(id: string) {
        setCart((prev) =>
            prev
                .map((c) =>
                    c.id === id ? { ...c, qty: c.qty - 1 } : c
                )
                .filter((c) => c.qty > 0)
        );
    }

    // ⭐️ ลบเฉพาะรายการ
    function removeItem(id: string) {
        setCart((prev) => prev.filter((c) => c.id !== id));
    }

    // ⭐️ ลบทั้งหมด
    function clearCart() {
        setCart([]);
    }

    /* -------------------- CALCULATE TOTAL -------------------- */
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

    /* -------------------- CHECKOUT -------------------- */
    async function checkout() {
        if (cart.length === 0) return;

        setLoading(true);

        try {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: cart,
                    total,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setCart([]);
            }
        } catch (error) {
            console.error("ปิดบิลผิดพลาด:", error);
        }

        setLoading(false);
    }

    /* -------------------- RENDER -------------------- */
    return (
        <div className="flex h-screen bg-background text-text-primary">

            {/* LEFT: Menu List */}
            <div className="w-2/3 border-r border-[var(--text-muted)]/20 p-4 overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 text-text-primary">
                    เมนูทั้งหมด
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {menu.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => addToCart(item)}
                            className="p-4 rounded-xl border border-[var(--text-muted)]/20 
                                       bg-surface cursor-pointer 
                                       hover:bg-accent/20 transition"
                        >
                            <div className="font-semibold text-text-primary">
                                {item.name}
                            </div>
                            <div className="text-text-secondary">
                                {item.price} บาท
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* RIGHT: Cart */}
            <div className="w-1/3 p-4 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 text-text-primary">
                    ตะกร้า
                </h2>

                <div className="flex-1 overflow-y-auto space-y-3">
                    {cart.map((item) => (
                        <div
                            key={item.id}
                            className="p-3 border border-[var(--text-muted)]/20 
                                       rounded-lg bg-surface"
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="font-semibold text-text-primary">
                                        {item.name}
                                    </div>
                                    <div className="text-text-muted text-sm">
                                        {item.qty} × {item.price} บาท
                                    </div>
                                </div>

                                <div className="font-bold text-text-primary">
                                    {item.qty * item.price}
                                </div>
                            </div>

                            {/* Qty control + Remove */}
                            <div className="mt-2 flex gap-2">
                                <button
                                    onClick={() => decreaseQty(item.id)}
                                    className="w-8 h-8 rounded-md bg-accent/20 text-text-primary"
                                >
                                    -
                                </button>

                                <button
                                    onClick={() => increaseQty(item.id)}
                                    className="w-8 h-8 rounded-md bg-accent/20 text-text-primary"
                                >
                                    +
                                </button>

                                <button
                                    onClick={() => removeItem(item.id)}
                                    className="px-3 py-1 text-sm rounded-md 
                                               bg-[var(--text-muted)]/20 
                                               text-text-secondary 
                                               hover:bg-[var(--text-muted)]/30"
                                >
                                    ลบ
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Summary */}
                <div className="mt-4 border-t border-[var(--text-muted)]/20 pt-4">
                    <div className="flex justify-between text-lg font-bold text-text-primary">
                        <span>ยอดรวมทั้งหมด</span>
                        <span>{total} บาท</span>
                    </div>

                    {/* ⭐ ปุ่มลบตะกร้าทั้งหมด */}
                    <button
                        onClick={clearCart}
                        disabled={cart.length === 0}
                        className="mt-3 w-full py-2 rounded-lg 
                                   bg-[var(--text-muted)]/20 text-text-secondary 
                                   hover:bg-[var(--text-muted)]/30 
                                   active:scale-[0.98] transition
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ลบสินค้าทั้งหมด
                    </button>

                    <button
                        onClick={checkout}
                        disabled={loading || cart.length === 0}
                        className="mt-4 w-full py-3 rounded-xl text-xl font-bold
                                   bg-accent text-white 
                                   hover:bg-accent-dark 
                                   active:scale-[0.98] transition
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "กำลังปิดบิล..." : "ปิดบิล"}
                    </button>
                </div>
            </div>
        </div>
    );
}
