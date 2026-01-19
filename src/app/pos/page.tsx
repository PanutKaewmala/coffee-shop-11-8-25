"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

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
    id: string; // variant_id
    variant_id: string;
    menu_id: string;
    menu_name: string;
    variant_label: string;
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

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
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
                        isRecord(st) &&
                            typeof st.id === "string" &&
                            typeof st.name === "string"
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

/* =========================
   UI helpers
========================= */
function serveLabel(v: PosVariant) {
    return v.serve_type?.name?.trim() ? v.serve_type!.name : "Default";
}

function getMinVariantPrice(item: PosMenuItem): number {
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const base = toNumber(item.price, 0);
    if (variants.length === 0) return base;

    let min = Number.POSITIVE_INFINITY;
    for (const v of variants) {
        const p = toNumber(v.price, base);
        if (p < min) min = p;
    }
    return Number.isFinite(min) ? min : base;
}

function resolveDefaultVariant(item: PosMenuItem): PosVariant | null {
    const variants = Array.isArray(item.variants) ? item.variants : [];
    if (variants.length === 0) return null;
    return variants.find((v) => v.is_default) ?? variants[0] ?? null;
}

export default function POSPage() {
    /* -------------------- STATE -------------------- */
    const [menu, setMenu] = useState<PosMenuItem[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(false);

    // key: menu_id -> variant_id
    const [variantPick, setVariantPick] = useState<Record<string, string>>({});

    // filters
    const [query, setQuery] = useState("");
    const [activeCatId, setActiveCatId] = useState<string>("all");

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

                const dv = resolveDefaultVariant(m);
                if (!dv) continue;

                next[m.id] = dv.id;
            }

            return next;
        });
    }, [menu]);

    /* -------------------- DERIVED: categories -------------------- */
    const categories = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of menu) {
            const c = m.category;
            if (c?.id && c.name) map.set(c.id, c.name);
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [menu]);

    const filteredMenu = useMemo(() => {
        const q = query.trim().toLowerCase();
        return menu.filter((m) => {
            const okCat = activeCatId === "all" ? true : m.category?.id === activeCatId;
            if (!okCat) return false;

            if (!q) return true;
            const hay = `${m.name} ${m.description ?? ""} ${m.category?.name ?? ""}`.toLowerCase();
            return hay.includes(q);
        });
    }, [menu, query, activeCatId]);

    /* -------------------- SELECTED VARIANT -------------------- */
    const getSelectedVariant = useCallback(
        (item: PosMenuItem): PosVariant | null => {
            const variants = Array.isArray(item.variants) ? item.variants : [];
            if (variants.length === 0) return null;

            const pickedId = variantPick[item.id];
            return (
                variants.find((v) => v.id === pickedId) ??
                variants.find((v) => v.is_default) ??
                variants[0] ??
                null
            );
        },
        [variantPick]
    );

    /* -------------------- CART OPS -------------------- */
    const addVariantToCart = useCallback((item: PosMenuItem, variantId: string) => {
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const v = variants.find((x) => x.id === variantId) ?? null;
        if (!v) return;

        const base = toNumber(item.price, 0);
        const price = toNumber(v.price, base);

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
                menu_name: item.name,
                variant_label: serveLabel(v),
                price,
                qty: 1,
            };

            return [...prev, next];
        });
    }, []);

    // ✅ add จากการ์ดเท่านั้น (serve ไม่ add)
    const addToCart = useCallback(
        (item: PosMenuItem) => {
            const variants = Array.isArray(item.variants) ? item.variants : [];
            if (variants.length === 0) {
                alert(`เมนู "${item.name}" ยังไม่มี variants`);
                return;
            }

            const selected = getSelectedVariant(item) ?? resolveDefaultVariant(item);
            if (!selected?.id) {
                alert("เลือก variant ไม่สำเร็จ");
                return;
            }

            addVariantToCart(item, selected.id);
        },
        [addVariantToCart, getSelectedVariant]
    );

    const increaseQty = useCallback((variantId: string) => {
        setCart((prev) =>
            prev.map((c) => (c.variant_id === variantId ? { ...c, qty: c.qty + 1 } : c))
        );
    }, []);

    const decreaseQty = useCallback((variantId: string) => {
        setCart((prev) =>
            prev
                .map((c) => (c.variant_id === variantId ? { ...c, qty: c.qty - 1 } : c))
                .filter((c) => c.qty > 0)
        );
    }, []);

    const removeItem = useCallback((variantId: string) => {
        setCart((prev) => prev.filter((c) => c.variant_id !== variantId));
    }, []);

    const clearCart = useCallback(() => setCart([]), []);

    /* -------------------- TOTAL -------------------- */
    const total = useMemo(() => cart.reduce((sum, i) => sum + i.price * i.qty, 0), [cart]);

    /* -------------------- GROUPED CART -------------------- */
    type CartGroup = {
        menu_id: string;
        menu_name: string;
        lines: CartItem[];
        groupQty: number;
        groupTotal: number;
    };

    const groupedCart: CartGroup[] = useMemo(() => {
        const map = new Map<string, CartGroup>();
        const lastIndex = new Map<string, number>();

        for (let i = 0; i < cart.length; i++) {
            const it = cart[i];
            lastIndex.set(it.menu_id, i);

            const prev = map.get(it.menu_id);
            if (!prev) {
                map.set(it.menu_id, {
                    menu_id: it.menu_id,
                    menu_name: it.menu_name,
                    lines: [it],
                    groupQty: it.qty,
                    groupTotal: it.qty * it.price,
                });
            } else {
                prev.lines.push(it);
                prev.groupQty += it.qty;
                prev.groupTotal += it.qty * it.price;
            }
        }

        return Array.from(map.values()).sort(
            (a, b) => (lastIndex.get(b.menu_id) ?? 0) - (lastIndex.get(a.menu_id) ?? 0)
        );
    }, [cart]);

    /* -------------------- KEYBOARD SHORTCUTS -------------------- */
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                if (cart.length > 0 && !loading) clearCart();
            }
            if (e.key === "Enter") {
                if (cart.length > 0 && !loading) void checkout();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart.length, loading]);

    /* -------------------- CHECKOUT -------------------- */
    async function checkout() {
        if (cart.length === 0) return;
        setLoading(true);

        try {
            const payload: PosCheckoutPayload = {
                items: cart.map((c) => ({
                    variant_id: c.variant_id,
                    qty: clamp(c.qty, 1, 999),
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

            const data: PosCheckoutResponse = isRecord(raw) ? (raw as PosCheckoutResponse) : {};

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

                    <div className="flex items-center gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหาเมนู..."
                            className="w-64 px-3 py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary placeholder:text-text-muted"
                        />

                        <select
                            value={activeCatId}
                            onChange={(e) => setActiveCatId(e.target.value)}
                            className="px-3 py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary"
                        >
                            <option value="all">ทุกหมวด</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {filteredMenu.map((item) => {
                        const variants = Array.isArray(item.variants) ? item.variants : [];
                        const selectedVariant = getSelectedVariant(item);

                        return (
                            <div
                                key={item.id}
                                // ✅ add ที่การ์ด (เหมือนเดิม)
                                onClick={() => addToCart(item)}
                                className="p-4 rounded-xl border border-[var(--text-muted)]/20 bg-surface cursor-pointer hover:bg-accent/20 transition"
                                title="คลิกเพื่อเพิ่ม"
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

                                    <div className="shrink-0 text-xs text-text-muted">
                                        คลิกเพื่อเพิ่ม
                                    </div>
                                </div>

                                {/* pills: เลือก serve อย่างเดียว (ไม่ add) */}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {variants.length === 0 ? (
                                        <span className="text-sm text-text-muted">ไม่มี Serve</span>
                                    ) : (
                                        variants.map((v) => {
                                            const active = (selectedVariant?.id ?? "") === v.id;

                                            return (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={(e) => {
                                                        // ✅ กันไม่ให้ bubble ไป addToCart
                                                        e.stopPropagation();
                                                        setVariantPick((prev) => ({
                                                            ...prev,
                                                            [item.id]: v.id,
                                                        }));
                                                    }}
                                                    className={[
                                                        "px-3 py-1 rounded-full text-sm border transition",
                                                        active
                                                            ? "bg-accent text-white border-accent"
                                                            : "bg-[var(--text-muted)]/10 text-text-secondary border-[var(--text-muted)]/20 hover:bg-accent/20",
                                                    ].join(" ")}
                                                    title={`${serveLabel(v)} — ${toNumber(
                                                        v.price,
                                                        item.price
                                                    )} บาท`}
                                                >
                                                    {serveLabel(v)}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="mt-2 text-xs text-text-muted">
                                    เลือกประเภทก่อน แล้วค่อยคลิกการ์ดเพื่อเพิ่ม
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Cart */}
            <div className="w-1/3 p-4 flex flex-col">
                <div className="flex items-end justify-between mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">ตะกร้า</h2>
                    <div className="text-xs text-text-muted">Enter = ปิดบิล • Esc = ล้างตะกร้า</div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3">
                    {groupedCart.length === 0 ? (
                        <div className="p-4 rounded-xl border border-[var(--text-muted)]/20 bg-surface text-text-muted">
                            ยังไม่มีรายการ
                        </div>
                    ) : (
                        groupedCart.map((g) => (
                            <div
                                key={g.menu_id}
                                className="p-3 border border-[var(--text-muted)]/20 rounded-lg bg-surface"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-text-primary truncate">
                                            {g.menu_name}
                                        </div>
                                        <div className="text-xs text-text-muted">
                                            รวม {g.groupQty} ชิ้น
                                        </div>
                                    </div>

                                    <div className="font-bold text-text-primary">{g.groupTotal}</div>
                                </div>

                                <div className="mt-3 space-y-2">
                                    {g.lines
                                        .slice()
                                        .sort((a, b) => a.variant_label.localeCompare(b.variant_label))
                                        .map((it) => (
                                            <div
                                                key={it.variant_id}
                                                className="flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm text-text-secondary truncate">
                                                        • {it.variant_label}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {it.qty} × {it.price} บาท
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => decreaseQty(it.variant_id)}
                                                        className="w-8 h-8 rounded-md bg-accent/20 text-text-primary active:scale-[0.98]"
                                                    >
                                                        -
                                                    </button>

                                                    <button
                                                        onClick={() => increaseQty(it.variant_id)}
                                                        className="w-8 h-8 rounded-md bg-accent/20 text-text-primary active:scale-[0.98]"
                                                    >
                                                        +
                                                    </button>

                                                    <button
                                                        onClick={() => removeItem(it.variant_id)}
                                                        className="px-3 h-8 text-sm rounded-md bg-[var(--text-muted)]/20 text-text-secondary hover:bg-[var(--text-muted)]/30 active:scale-[0.98]"
                                                    >
                                                        ลบ
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        ))
                    )}
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
                        onClick={() => void checkout()}
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
