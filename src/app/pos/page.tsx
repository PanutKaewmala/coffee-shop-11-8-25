"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================
   Types (match /api/pos response)
========================= */
type PosServeType = { id: string; name: string };

type PosVariant = {
    id: string;
    is_default: boolean;
    price: number;
    serve_type: PosServeType | null;
};

type PosMenuItem = {
    id: string;
    name: string;
    price: number; // base price from menu
    image_url: string | null;
    description: string | null;
    category: { id: string; name: string } | null;
    variants: PosVariant[];
};

type PosFeedResponse = { menu: PosMenuItem[] };

/* =========================
   Checkout types
========================= */
type PosCheckoutPayload = {
    items: { variant_id: string; qty: number }[];
    // branch_id?: string; // ถ้าจะใช้ทีหลัง ค่อยเปิด
};

type PosCheckoutResponse = {
    success?: boolean;
    error?: string;
    order?: unknown;
    deducted?: unknown;
    debug?: unknown;
};

/* =========================
   Local cart type
========================= */
type CartItem = {
    id: string; // use variant_id as unique key
    variant_id: string;
    menu_id: string;
    name: string;
    price: number;
    qty: number;
};

/* =========================
   Helpers (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function parsePosFeed(data: unknown): PosMenuItem[] {
    if (!isRecord(data)) return [];
    const menu = asArray<unknown>(data.menu);

    return menu
        .map((m): PosMenuItem | null => {
            if (!isRecord(m)) return null;

            const variantsRaw = asArray<unknown>(m.variants);
            const variants: PosVariant[] = variantsRaw
                .map((v): PosVariant | null => {
                    if (!isRecord(v)) return null;

                    const st = v.serve_type;
                    const serve_type =
                        isRecord(st) && typeof st.id === "string" && typeof st.name === "string"
                            ? { id: st.id, name: st.name }
                            : null;

                    if (typeof v.id !== "string") return null;

                    return {
                        id: v.id,
                        is_default: Boolean(v.is_default),
                        price: toNumber(v.price, 0),
                        serve_type,
                    };
                })
                .filter((x): x is PosVariant => x !== null);

            const categoryRaw = m.category;
            const category =
                isRecord(categoryRaw) &&
                    typeof categoryRaw.id === "string" &&
                    typeof categoryRaw.name === "string"
                    ? { id: categoryRaw.id, name: categoryRaw.name }
                    : null;

            if (typeof m.id !== "string" || typeof m.name !== "string") return null;

            return {
                id: m.id,
                name: m.name,
                price: toNumber(m.price, 0),
                image_url: typeof m.image_url === "string" ? m.image_url : null,
                description: typeof m.description === "string" ? m.description : null,
                category,
                variants,
            };
        })
        .filter((x): x is PosMenuItem => x !== null);
}

export default function POSPage() {
    /* -------------------- STATE -------------------- */
    const [menu, setMenu] = useState<PosMenuItem[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(false);

    // key: menu_id -> variant_id
    const [variantPick, setVariantPick] = useState<Record<string, string>>({});

    /* -------------------- LOAD MENU (POS FEED) -------------------- */
    useEffect(() => {
        let alive = true;

        async function fetchMenu() {
            try {
                const res = await fetch("/api/pos", { cache: "no-store" });

                if (!res.ok) {
                    const raw = await res.text();
                    console.error("❌ /api/pos error:", res.status, raw);
                    return;
                }

                const raw: unknown = await res.json().catch(async () => {
                    const t = await res.text();
                    console.error("⚠️ /api/pos returned non-JSON:", t);
                    return null;
                });

                const menuList = parsePosFeed(raw);

                if (!alive) return;
                setMenu(menuList);
            } catch (err) {
                console.error("โหลดเมนู (POS feed) ล้มเหลว:", err);
            }
        }

        fetchMenu();
        return () => {
            alive = false;
        };
    }, []);

    /* -------------------- INIT DEFAULT VARIANT PER MENU -------------------- */
    useEffect(() => {
        if (menu.length === 0) return;

        setVariantPick((prev) => {
            const next: Record<string, string> = { ...prev };

            for (const m of menu) {
                if (next[m.id]) continue;

                const variants = Array.isArray(m.variants) ? m.variants : [];
                if (variants.length === 0) continue;

                const dv = variants.find((v) => v.is_default) ?? variants[0];
                next[m.id] = dv.id;
            }

            return next;
        });
    }, [menu]);

    /* -------------------- HELPERS -------------------- */
    function getSelectedVariant(item: PosMenuItem): PosVariant | null {
        const variants = Array.isArray(item.variants) ? item.variants : [];
        if (variants.length === 0) return null;

        const pickedId = variantPick[item.id];
        return (
            variants.find((v) => v.id === pickedId) ??
            variants.find((v) => v.is_default) ??
            variants[0] ??
            null
        );
    }

    function getVariantLabel(v: PosVariant) {
        return v.serve_type?.name ?? "Default";
    }

    function getMinVariantPrice(item: PosMenuItem): number {
        const variants = Array.isArray(item.variants) ? item.variants : [];
        if (variants.length === 0) return toNumber(item.price, 0);

        let min = Number.POSITIVE_INFINITY;
        for (const v of variants) {
            const p = toNumber(v.price, toNumber(item.price, 0));
            if (p < min) min = p;
        }
        return Number.isFinite(min) ? min : toNumber(item.price, 0);
    }

    function getVariantOptionLabel(v: PosVariant) {
        return `${getVariantLabel(v)} — ${toNumber(v.price, 0)} บาท`;
    }

    /* -------------------- ADD TO CART (BY VARIANT) -------------------- */
    function addToCart(item: PosMenuItem) {
        const variants = Array.isArray(item.variants) ? item.variants : [];
        if (variants.length === 0) {
            alert(`เมนู "${item.name}" ยังไม่มี variants`);
            return;
        }

        const v = getSelectedVariant(item);
        if (!v?.id) {
            alert("เลือก variant ไม่สำเร็จ");
            return;
        }

        const variantId = v.id;
        const price = toNumber(v.price, toNumber(item.price, 0));
        const displayName = `${item.name} (${getVariantLabel(v)})`;

        setCart((prev) => {
            const exists = prev.find((c) => c.variant_id === variantId);

            if (exists) {
                return prev.map((c) =>
                    c.variant_id === variantId ? { ...c, qty: c.qty + 1 } : c
                );
            }

            const next: CartItem = {
                id: variantId,
                variant_id: variantId,
                menu_id: item.id,
                name: displayName,
                price,
                qty: 1,
            };

            return [...prev, next];
        });
    }

    function increaseQty(variantId: string) {
        setCart((prev) =>
            prev.map((c) => (c.variant_id === variantId ? { ...c, qty: c.qty + 1 } : c))
        );
    }

    function decreaseQty(variantId: string) {
        setCart((prev) =>
            prev
                .map((c) => (c.variant_id === variantId ? { ...c, qty: c.qty - 1 } : c))
                .filter((c) => c.qty > 0)
        );
    }

    function removeItem(variantId: string) {
        setCart((prev) => prev.filter((c) => c.variant_id !== variantId));
    }

    function clearCart() {
        setCart([]);
    }

    /* -------------------- TOTAL -------------------- */
    const total = useMemo(
        () => cart.reduce((sum, i) => sum + i.price * i.qty, 0),
        [cart]
    );

    /* -------------------- CHECKOUT (POST /api/pos) -------------------- */
    async function checkout() {
        if (cart.length === 0) return;
        setLoading(true);

        try {
            const payload: PosCheckoutPayload = {
                items: cart.map((c) => ({
                    variant_id: c.variant_id,
                    qty: c.qty,
                })),
            };

            const res = await fetch("/api/pos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const raw: unknown = await res.json().catch(async () => {
                const txt = await res.text();
                console.error("⚠️ /api/pos returned non-JSON:", txt);
                throw new Error("Server returned invalid JSON");
            });

            const data: PosCheckoutResponse = (isRecord(raw) ? (raw as PosCheckoutResponse) : {});

            if (!res.ok) {
                console.error("❌ POS checkout failed:", { status: res.status, data });

                const msg =
                    (typeof data.error === "string" && data.error) ||
                    (res.status === 400
                        ? "ข้อมูลไม่ครบ/สต็อกไม่พอ/ไม่มีสูตร (เช็ค recipe_items)"
                        : "ปิดบิลล้มเหลว (server error)");

                alert(msg);
                return;
            }

            setCart([]);
            alert("✅ ปิดบิลสำเร็จ");
        } catch (err) {
            console.error("ปิดบิลผิดพลาด:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            setLoading(false);
        }
    }

    /* -------------------- RENDER -------------------- */
    return (
        <div className="flex h-screen bg-background text-text-primary">
            {/* LEFT: Menu List */}
            <div className="w-2/3 border-r border-[var(--text-muted)]/20 p-4 overflow-y-auto">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">เมนูทั้งหมด</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {menu.map((item) => {
                        const variants = Array.isArray(item.variants) ? item.variants : [];
                        const selectedVariant = getSelectedVariant(item);

                        return (
                            <div
                                key={item.id}
                                onClick={() => addToCart(item)}
                                className="p-4 rounded-xl border border-[var(--text-muted)]/20 bg-surface cursor-pointer hover:bg-accent/20 transition"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-text-primary truncate">
                                            {item.name}
                                        </div>

                                        <div className="text-text-secondary">
                                            เริ่มต้น {getMinVariantPrice(item)} บาท
                                        </div>
                                    </div>

                                    {/* Variant selector ต่อเมนู */}
                                    <div className="shrink-0">
                                        <select
                                            value={selectedVariant?.id ?? ""}
                                            disabled={variants.length === 0}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                const variantId = e.target.value;
                                                setVariantPick((prev) => ({
                                                    ...prev,
                                                    [item.id]: variantId,
                                                }));
                                            }}
                                            className="px-3 py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary disabled:opacity-50"
                                        >
                                            {variants.length === 0 ? (
                                                <option value="">ไม่มี Serve</option>
                                            ) : (
                                                variants.map((v) => (
                                                    <option key={v.id} value={v.id}>
                                                        {getVariantOptionLabel(v)}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Cart */}
            <div className="w-1/3 p-4 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 text-text-primary">ตะกร้า</h2>

                <div className="flex-1 overflow-y-auto space-y-3">
                    {cart.map((item) => (
                        <div
                            key={item.variant_id}
                            className="p-3 border border-[var(--text-muted)]/20 rounded-lg bg-surface"
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="font-semibold text-text-primary">{item.name}</div>
                                    <div className="text-text-muted text-sm">
                                        {item.qty} × {item.price} บาท
                                    </div>
                                </div>

                                <div className="font-bold text-text-primary">
                                    {item.qty * item.price}
                                </div>
                            </div>

                            <div className="mt-2 flex gap-2">
                                <button
                                    onClick={() => decreaseQty(item.variant_id)}
                                    className="w-8 h-8 rounded-md bg-accent/20 text-text-primary"
                                >
                                    -
                                </button>

                                <button
                                    onClick={() => increaseQty(item.variant_id)}
                                    className="w-8 h-8 rounded-md bg-accent/20 text-text-primary"
                                >
                                    +
                                </button>

                                <button
                                    onClick={() => removeItem(item.variant_id)}
                                    className="px-3 py-1 text-sm rounded-md bg-[var(--text-muted)]/20 text-text-secondary hover:bg-[var(--text-muted)]/30"
                                >
                                    ลบ
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 border-t border-[var(--text-muted)]/20 pt-4">
                    <div className="flex justify-between text-lg font-bold text-text-primary">
                        <span>ยอดรวมทั้งหมด</span>
                        <span>{total} บาท</span>
                    </div>

                    <button
                        onClick={clearCart}
                        disabled={loading || cart.length === 0}
                        className="mt-3 w-full py-2 rounded-lg bg-[var(--text-muted)]/20 text-text-secondary hover:bg-[var(--text-muted)]/30 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ลบสินค้าทั้งหมด
                    </button>

                    <button
                        onClick={checkout}
                        disabled={loading || cart.length === 0}
                        className="mt-4 w-full py-3 rounded-xl text-xl font-bold bg-accent text-white hover:bg-accent-dark active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "กำลังปิดบิล..." : "ปิดบิล"}
                    </button>
                </div>
            </div>
        </div>
    );
}
