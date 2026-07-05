"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReceiptSettings } from "@/lib/types";

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

/* =========================
   Checkout types
========================= */
type PosCheckoutPayload = {
    items: { variant_id: string; qty: number }[];
    payment_method: "cash" | "promptpay";
    paid_amount?: number;
};

type PosCheckoutResponse = {
    success?: boolean;
    error?: string;
    code?: string;
    order?: unknown;
    deducted?: unknown;
    debug?: unknown;
};

type PosContextResponse = {
    currentShopId?: unknown;
    currentBranchId?: unknown;
    shops?: unknown;
    branches?: unknown;
};

type PosContextView = {
    shopId: string | null;
    shopName: string | null;
    branchId: string | null;
    branchName: string | null;
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

type ReceiptItem = {
    name: string;
    variantLabel: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
};

type ReceiptData = {
    orderId: string;
    createdAt: string;
    items: ReceiptItem[];
    total: number;
    paymentMethod: "cash" | "promptpay";
    paidAmount: number;
    changeAmount: number;
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

function toNonEmptyString(v: unknown): string | null {
    return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function parseNumberInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
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

function parsePosContext(data: unknown): PosContextView {
    if (!isRecord(data)) {
        return { shopId: null, shopName: null, branchId: null, branchName: null };
    }

    const raw = data as PosContextResponse;
    const shopId = toNonEmptyString(raw.currentShopId);
    const branchId = toNonEmptyString(raw.currentBranchId);

    const shops = asArray<unknown>(raw.shops);
    const branches = asArray<unknown>(raw.branches);

    const shopObj = shops.map((x) => (isRecord(x) ? x : null)).find((x) =>
        Boolean(
            x && typeof x.id === "string" && x.id === shopId && typeof x.name === "string"
        )
    );
    const shopName = isRecord(shopObj) && typeof shopObj.name === "string" ? shopObj.name : null;

    const branchObj = branches.map((x) => (isRecord(x) ? x : null)).find((x) =>
        Boolean(
            x && typeof x.id === "string" && x.id === branchId && typeof x.name === "string"
        )
    );
    const branchName = isRecord(branchObj) && typeof branchObj.name === "string" ? branchObj.name : null;

    return { shopId, shopName, branchId, branchName };
}

function parseReceiptSettings(data: unknown): ReceiptSettings | null {
    if (!isRecord(data)) return null;

    const shopId = toNonEmptyString(data.shopId);
    const shopName = toNonEmptyString(data.shopName);
    if (!shopId || !shopName) return null;

    return {
        shopId,
        shopName,
        taxId: toNonEmptyString(data.taxId),
        receiptFooter: toNonEmptyString(data.receiptFooter),
        branchId: toNonEmptyString(data.branchId),
        branchName: toNonEmptyString(data.branchName),
        branchAddress: toNonEmptyString(data.branchAddress),
        branchPhone: toNonEmptyString(data.branchPhone),
        canEditShopSettings: data.canEditShopSettings === true,
    };
}

function formatPrice(n: number) {
    try {
        return new Intl.NumberFormat("th-TH", {
            style: "currency",
            currency: "THB",
            maximumFractionDigits: 2,
        }).format(n);
    } catch {
        return String(n);
    }
}

function formatDateTime(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function getBangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Bangkok",
    });
}

function paymentMethodLabel(method: "cash" | "promptpay") {
    return method === "cash" ? "เงินสด" : "พร้อมเพย์";
}

function generateIdempotencyKey(): string {
    const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (c && typeof c.randomUUID === "function") {
        try {
            return c.randomUUID();
        } catch {
            // fallthrough to fallback
        }
    }
    return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const CASH_ADD_AMOUNTS = [5, 10, 20, 50, 100, 500, 1000] as const;
const CASH_PRESET_AMOUNTS = [50, 100, 500, 1000] as const;

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
    const idempotencyKeyRef = useRef<string | null>(null);
    const [feedError, setFeedError] = useState<string | null>(null);
    const [feedbackText, setFeedbackText] = useState<string | null>(null);
    const [lastTouchedVariantId, setLastTouchedVariantId] = useState<string | null>(null);
    const feedbackTimerRef = useRef<number | null>(null);
    const lineFlashTimerRef = useRef<number | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "promptpay">("cash");
    const [paidAmount, setPaidAmount] = useState<string>("");
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [receiptPrintMode, setReceiptPrintMode] = useState<"thermal" | "a4">("thermal");
    const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);

    // key: menu_id -> variant_id
    const [variantPick, setVariantPick] = useState<Record<string, string>>({});

    // filters
    const [query, setQuery] = useState("");
    const [activeCatId, setActiveCatId] = useState<string>("all");
    const [context, setContext] = useState<PosContextView>({
        shopId: null,
        shopName: null,
        branchId: null,
        branchName: null,
    });

    const [businessDate, setBusinessDate] = useState<string | null>(null);
    const [dailyCloseStatus, setDailyCloseStatus] = useState<string | null>(null);
    const [dailyCloseLoading, setDailyCloseLoading] = useState(false);
    const [dailyCloseError, setDailyCloseError] = useState<string | null>(null);

    /* -------------------- LOAD CONTEXT (SHOP/BRANCH) -------------------- */
    useEffect(() => {
        let alive = true;

        async function fetchContext() {
            try {
                const res = await fetch("/api/admin/navbar", { cache: "no-store" });
                if (!res.ok) return;

                const raw: unknown = await res.json().catch(() => null);
                if (!alive) return;
                setContext(parsePosContext(raw));
            } catch {
                // ignore context fetch errors on POS page
            }
        }

        void fetchContext();
        return () => {
            alive = false;
        };
    }, []);

    /* -------------------- LOAD RECEIPT DISPLAY SETTINGS -------------------- */
    useEffect(() => {
        let alive = true;

        async function fetchReceiptSettings() {
            try {
                const res = await fetch("/api/receipt-settings", { cache: "no-store" });
                if (!res.ok) {
                    if (alive) setReceiptSettings(null);
                    return;
                }

                const raw: unknown = await res.json().catch(() => null);
                if (!alive) return;
                setReceiptSettings(parseReceiptSettings(raw));
            } catch {
                if (alive) setReceiptSettings(null);
            }
        }

        void fetchReceiptSettings();
        return () => {
            alive = false;
        };
    }, [context.shopId, context.branchId]);

    /* -------------------- LOAD DAILY CLOSE STATUS -------------------- */
    useEffect(() => {
        let alive = true;

        async function fetchDailyClose() {
            if (!context.shopId || !context.branchId) return;
            const today = getBangkokToday();
            setBusinessDate(today);
            setDailyCloseStatus(null);
            setDailyCloseLoading(true);
            setDailyCloseError(null);

            try {
                const res = await fetch(`/api/daily-close?date=${encodeURIComponent(today)}`, {
                    cache: "no-store",
                });

                if (!res.ok) {
                    if (res.status === 409) {
                        setDailyCloseStatus(null);
                        setDailyCloseError(null);
                        return;
                    }
                    throw new Error(`HTTP ${res.status}`);
                }

                const raw: unknown = await res.json().catch(() => null);
                if (!alive) return;

                const record = isRecord(raw) ? raw : null;
                const close = isRecord(record?.close) ? record.close : null;
                const status = isRecord(close) && typeof close.status === "string" ? close.status : null;
                setDailyCloseStatus(status);
            } catch (err) {
                if (!alive) return;
                const message = err instanceof Error ? err.message : "โหลดสถานะปิดยอดวันไม่สำเร็จ";
                setDailyCloseError(message);
                setDailyCloseStatus(null);
            } finally {
                if (alive) setDailyCloseLoading(false);
            }
        }

        void fetchDailyClose();
        return () => {
            alive = false;
        };
    }, [context.shopId, context.branchId]);

    /* -------------------- LOAD MENU (POS FEED) -------------------- */
    useEffect(() => {
        let alive = true;

        async function fetchMenu() {
            try {
                const res = await fetch("/api/pos", { cache: "no-store" });

                if (!res.ok) {
                    const raw = await res.text();
                    console.error("❌ /api/pos error:", res.status, raw);
                    if (!alive) return;
                    setFeedError(`โหลดเมนูไม่สำเร็จ (HTTP ${res.status})`);
                    return;
                }

                const raw: unknown = await res.json().catch(async () => {
                    const t = await res.text();
                    console.error("⚠️ /api/pos returned non-JSON:", t);
                    return null;
                });

                const menuList = parsePosFeed(raw);

                if (!alive) return;
                setFeedError(null);
                setMenu(menuList);
            } catch (err) {
                console.error("โหลดเมนู (POS feed) ล้มเหลว:", err);
                if (!alive) return;
                setFeedError("โหลดเมนูไม่สำเร็จ กรุณาลองรีเฟรช");
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

    const pushFeedback = useCallback((text: string, variantId?: string) => {
        setFeedbackText(text);
        if (feedbackTimerRef.current !== null) {
            window.clearTimeout(feedbackTimerRef.current);
        }
        feedbackTimerRef.current = window.setTimeout(() => {
            setFeedbackText(null);
            feedbackTimerRef.current = null;
        }, 1400);

        if (variantId) {
            setLastTouchedVariantId(variantId);
            if (lineFlashTimerRef.current !== null) {
                window.clearTimeout(lineFlashTimerRef.current);
            }
            lineFlashTimerRef.current = window.setTimeout(() => {
                setLastTouchedVariantId(null);
                lineFlashTimerRef.current = null;
            }, 1100);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (feedbackTimerRef.current !== null) {
                window.clearTimeout(feedbackTimerRef.current);
            }
            if (lineFlashTimerRef.current !== null) {
                window.clearTimeout(lineFlashTimerRef.current);
            }
        };
    }, []);

    /* -------------------- CART OPS -------------------- */
    const addVariantToCart = useCallback(
        (item: PosMenuItem, variantId: string) => {
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

            pushFeedback(`เพิ่ม ${item.name} (${serveLabel(v)})`, variantId);
        },
        [pushFeedback]
    );

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

    /* -------------------- CASH TENDER HELPERS -------------------- */
    const addCashAmount = useCallback((amount: number) => {
        const current = parseNumberInput(paidAmount) ?? 0;
        setPaidAmount(String(current + amount));
    }, [paidAmount]);

    const setExactCash = useCallback(() => {
        setPaidAmount(String(total));
    }, [total]);

    const setCashPreset = useCallback((amount: number) => {
        setPaidAmount(String(amount));
    }, []);

    const clearPaidAmount = useCallback(() => {
        setPaidAmount("");
    }, []);

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

    /* -------------------- CHECKOUT -------------------- */
    const canCashCheckout = useMemo(() => {
        if (paymentMethod !== "cash") return true;
        const paid = parseNumberInput(paidAmount);
        return paid != null && paid >= total && total > 0;
    }, [paymentMethod, paidAmount, total]);

    const isBusinessDayClosed = useMemo(() => {
        return dailyCloseStatus === "closed" || dailyCloseStatus === "approved";
    }, [dailyCloseStatus]);

    /* -------------------- KEYBOARD SHORTCUTS -------------------- */
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const isTypingTarget =
                tag === "input" ||
                tag === "textarea" ||
                tag === "select" ||
                Boolean(target?.isContentEditable);

            if (isTypingTarget) return;

            if (e.key === "Escape") {
                if (cart.length > 0 && !loading) clearCart();
            }
            if (e.key === "Enter") {
                if (cart.length > 0 && !loading && !isBusinessDayClosed) void checkout();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart.length, loading, isBusinessDayClosed]);

    async function checkout() {
        if (cart.length === 0) return;

        if (paymentMethod === "cash") {
            const paid = parseNumberInput(paidAmount);
            if (paid == null) {
                alert("กรุณากรอกจำนวนเงินที่รับ (บาท)");
                return;
            }
            if (paid < total) {
                alert(`เงินไม่พอ\nยอดรวม: ${formatPrice(total)}\nได้รับ: ${formatPrice(paid)}\nขาดอีก: ${formatPrice(total - paid)}`);
                return;
            }
        }

        if (idempotencyKeyRef.current) return;
        idempotencyKeyRef.current = generateIdempotencyKey();
        setLoading(true);

        try {
            const payload: PosCheckoutPayload = {
                items: cart.map((c) => ({
                    variant_id: c.variant_id,
                    qty: clamp(c.qty, 1, 999),
                })),
                payment_method: paymentMethod,
            };
            if (paymentMethod === "cash") {
                const parsedPaidAmount = parseNumberInput(paidAmount);
                if (parsedPaidAmount != null) {
                    payload.paid_amount = parsedPaidAmount;
                }
            }

            const res = await fetch("/api/pos", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKeyRef.current ?? "" },
                body: JSON.stringify(payload),
            });
            const debugText = await res.clone().text().catch(() => "");

            const raw: unknown = await res.json().catch(() => {
                console.error("⚠️ /api/pos returned non-JSON:", debugText);
                return null;
            });

            const data: PosCheckoutResponse = isRecord(raw) ? (raw as PosCheckoutResponse) : {};

            if (!res.ok) {
                const rawDump = (() => {
                    try {
                        return JSON.stringify(raw);
                    } catch {
                        return String(raw);
                    }
                })();
                console.error(
                    `POS checkout failed: HTTP ${res.status} ${res.statusText}; data=${JSON.stringify(
                        data
                    )}; raw=${rawDump}; text=${debugText}`
                );

                if (data.code === "NO_RECIPE") {
                    alert("This item is not ready for sale. Ask the owner to add a recipe for this variant.");
                    return;
                }

                if (data.code === "BUSINESS_DAY_CLOSED" && typeof data.error === "string") {
                    alert(data.error);
                    return;
                }

                const rawMessage =
                    isRecord(raw) && typeof raw.message === "string" ? raw.message : "";
                const msg =
                    (typeof data.error === "string" && data.error) ||
                    rawMessage ||
                    (debugText.trim() ? debugText : "") ||
                    (res.status === 400
                        ? "ข้อมูลไม่ครบ/สต็อกไม่พอ/ไม่มีสูตร (เช็ค recipe_items)"
                        : `ปิดบิลล้มเหลว (HTTP ${res.status})`);

                alert(msg);
                return;
            }

            // If server returned success flag, verify it before clearing cart
            if (!data.success) {
                const msg = (typeof data.error === "string" && data.error) || "ปิดบิลล้มเหลว";
                alert(msg);
                return;
            }

            const order = isRecord(data.order) ? (data.order as Record<string, unknown>) : null;
            const orderIdRaw = order ? order.id ?? order.order_id : null;
            const orderId = orderIdRaw ? String(orderIdRaw) : "";
            const receiptPaidAmount =
                paymentMethod === "cash" ? parseNumberInput(paidAmount) ?? 0 : total;
            const receiptChangeAmount =
                paymentMethod === "cash" ? receiptPaidAmount - total : 0;

            setReceiptData({
                orderId,
                createdAt: new Date().toISOString(),
                items: cart.map((c) => ({
                    name: c.menu_name,
                    variantLabel: c.variant_label,
                    qty: c.qty,
                    unitPrice: c.price,
                    lineTotal: c.price * c.qty,
                })),
                total,
                paymentMethod,
                paidAmount: receiptPaidAmount,
                changeAmount: receiptChangeAmount,
            });
            setCart([]);
            setPaidAmount("");
        } catch (err) {
            console.error("ปิดบิลผิดพลาด:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            // Clear active idempotency key only after request completes
            idempotencyKeyRef.current = null;
            setLoading(false);
        }
    }

    /* -------------------- PRINT STYLES FOR RECEIPT -------------------- */
    useEffect(() => {
        if (!receiptData) return;

        let styleEl: HTMLStyleElement | null = null;
        if (typeof document !== "undefined") {
            styleEl = document.createElement("style");
            const pageWidth = receiptPrintMode === "a4" ? "150mm" : "90mm";
            const pageMargin = receiptPrintMode === "a4" ? "5mm" : "2mm";
            styleEl.innerHTML = `@media print { @page { size: ${pageWidth} auto; margin: ${pageMargin}; } }`;
            document.head.appendChild(styleEl);
        }

        return () => {
            styleEl?.remove();
        };
    }, [receiptData, receiptPrintMode]);

    const receiptShopName = receiptSettings?.shopName ?? context.shopName ?? "Coffee SaaS";
    const receiptBranchName = receiptSettings?.branchName ?? context.branchName;
    const receiptBranchAddress = receiptSettings?.branchAddress ?? null;
    const receiptBranchPhone = receiptSettings?.branchPhone ?? null;
    const receiptTaxId = receiptSettings?.taxId ?? null;
    const receiptFooter = receiptSettings?.receiptFooter ?? null;

    /* -------------------- RENDER -------------------- */
    return (
            <div className="flex flex-col h-screen md:flex-row bg-background text-text-primary">
            {feedbackText ? (
                <div className="fixed right-4 top-4 z-50 rounded-lg border border-accent/50 bg-surface/95 px-3 py-2 text-sm text-text-primary shadow-xl backdrop-blur pointer-events-none">
                    {feedbackText}
                </div>
            ) : null}

            {/* LEFT: Menu List */}
            <div className="flex-1 min-h-0 overflow-y-auto border-b md:border-r md:w-2/3 md:flex-none p-3 md:p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="rounded-full border border-[var(--text-muted)]/20 bg-surface px-2 py-1">
                        Shop: {context.shopName ?? context.shopId ?? "-"}
                    </span>
                    <span className="rounded-full border border-[var(--text-muted)]/20 bg-surface px-2 py-1">
                        Branch: {context.branchName ?? context.branchId ?? "Not selected"}
                    </span>
                </div>
                <div className="flex flex-col gap-3 mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">เมนูทั้งหมด</h2>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหาเมนู..."
                            className="w-full sm:w-64 px-3 py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary placeholder:text-text-muted"
                        />

                        <select
                            value={activeCatId}
                            onChange={(e) => setActiveCatId(e.target.value)}
                            className="w-full sm:w-auto px-3 py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary"
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

                {feedError ? (
                    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
                        {feedError}
                    </div>
                ) : null}

                {filteredMenu.length === 0 ? (
                    <div className="rounded-xl border border-[var(--text-muted)]/20 bg-surface p-4 text-sm text-text-secondary">
                        {menu.length === 0
                            ? "ยังไม่มีเมนูที่พร้อมขายในสาขานี้ (ต้องเปิดเมนูในสาขา และมีสูตรใน variant อย่างน้อย 1 ตัว)"
                            : "ไม่พบเมนูตามตัวกรองที่เลือก"}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
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
                                            เริ่มต้น {formatPrice(getMinVariantPrice(item))}
                                        </div>
                                    </div>

                                    <div className="shrink-0 text-xs text-text-muted">
                                        คลิกเพื่อเพิ่ม
                                    </div>
                                </div>

                                {/* pills: แตะเพื่อเลือก+เพิ่มทันที */}
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
                                                        e.stopPropagation();
                                                        setVariantPick((prev) => ({
                                                            ...prev,
                                                            [item.id]: v.id,
                                                        }));
                                                        addVariantToCart(item, v.id);
                                                    }}
                                                    className={[
                                                        "px-3 py-1 rounded-full text-sm border transition",
                                                        active
                                                            ? "bg-accent text-white border-accent"
                                                            : "bg-[var(--text-muted)]/10 text-text-secondary border-[var(--text-muted)]/20 hover:bg-accent/20",
                                                    ].join(" ")}
                                                    title={`${serveLabel(v)} — ${formatPrice(
                                                        toNumber(v.price, item.price)
                                                    )}`}
                                                >
                                                    {serveLabel(v)}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="mt-2 text-xs text-text-muted">
                                    แตะปุ่มเสิร์ฟเพื่อเพิ่มทันที หรือแตะการ์ดเพื่อเพิ่มตัวที่เลือก
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: Cart */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4 flex flex-col md:w-1/3 md:flex-none">
                <div className="flex items-end justify-between mb-4">
                    <h2 className="text-2xl font-bold text-text-primary">ตะกร้า</h2>
                    <div className="text-xs text-text-muted">Enter = ปิดบิล • Esc = ล้างตะกร้า</div>
                </div>

                {dailyCloseLoading && (
                    <div className="mb-3 rounded-xl border border-[var(--text-muted)]/20 bg-surface p-3 text-sm text-text-muted">
                        กำลังตรวจสอบสถานะปิดบิล...
                    </div>
                )}
                {isBusinessDayClosed && businessDate && (
                    <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-sm font-medium text-red-700">
                        ปิดยอดวันนี้แล้ว ไม่สามารถสร้างบิลใหม่ได้
                    </div>
                )}
                {dailyCloseError && !dailyCloseLoading && !isBusinessDayClosed && (
                    <div className="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700">
                        {dailyCloseError}
                    </div>
                )}

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

                                    <div className="font-bold text-text-primary">{formatPrice(g.groupTotal)}</div>
                                </div>

                                <div className="mt-3 space-y-2">
                                    {g.lines
                                        .slice()
                                        .sort((a, b) => a.variant_label.localeCompare(b.variant_label))
                                        .map((it) => (
                                            <div
                                                key={it.variant_id}
                                                className={[
                                                    "flex items-center justify-between gap-3 rounded-md px-1 py-1 transition",
                                                    lastTouchedVariantId === it.variant_id
                                                        ? "bg-accent/15 ring-1 ring-accent/50"
                                                        : "",
                                                ].join(" ")}
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm text-text-secondary truncate">
                                                        • {it.variant_label}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {it.qty} × {formatPrice(it.price)}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => decreaseQty(it.variant_id)}
                                                        className="w-8 h-8 rounded-md bg-accent/20 text-text-primary active:scale-[0.98]"
                                                    >
                                                        -
                                                    </button>

                                                    <span className="min-w-6 text-center text-sm text-text-primary">
                                                        {it.qty}
                                                    </span>

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

                <div className="mt-4 border-t border-[var(--text-muted)]/20 pt-4 space-y-3">
                    <div className="text-xs text-text-muted">วิธีจ่ายเงิน</div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPaymentMethod("cash")}
                            className={[
                                "flex-1 py-2 rounded-lg text-sm border transition",
                                paymentMethod === "cash"
                                    ? "bg-accent text-white border-accent"
                                    : "bg-surface text-text-secondary border-[var(--text-muted)]/20 hover:bg-accent/20",
                            ].join(" ")}
                        >
                            เงินสด
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentMethod("promptpay")}
                            className={[
                                "flex-1 py-2 rounded-lg text-sm border transition",
                                paymentMethod === "promptpay"
                                    ? "bg-accent text-white border-accent"
                                    : "bg-surface text-text-secondary border-[var(--text-muted)]/20 hover:bg-accent/20",
                            ].join(" ")}
                        >
                            พร้อมเพย์ / QR
                        </button>
                    </div>

                    {paymentMethod === "cash" && (
                        <div className="space-y-2">
                            <div className="text-xs text-text-muted">รับเงิน (บาท)</div>
                            <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                step="0.01"
                                value={paidAmount}
                                onChange={(e) => setPaidAmount(e.target.value)}
                                placeholder="กรอกจำนวนเงินที่รับ"
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary"
                            />
                            {(() => {
                                const paid = parseNumberInput(paidAmount);
                                if (paid == null || total <= 0) return null;
                                if (paid >= total) {
                                    const change = paid - total;
                                    return (
                                        <div className="text-sm text-green-600">
                                            เงินทอน: {formatPrice(change)}
                                        </div>
                                    );
                                }
                                return (
                                    <div className="text-sm text-red-600">
                                        เงินไม่พอ: ขาดอีก {formatPrice(total - paid)}
                                    </div>
                                );
                            })()}

                            <div className="space-y-2 pt-1">
                                <div className="text-xs text-text-muted">รับเงินอย่างรวดเร็ว</div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={setExactCash}
                                        className="px-3 py-1.5 rounded-lg border border-[var(--text-muted)]/20 bg-surface text-sm text-text-secondary hover:bg-accent/20 transition"
                                    >
                                        พอดี ฿{total}
                                    </button>
                                    {CASH_PRESET_AMOUNTS.filter((a) => a >= total).map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => setCashPreset(amount)}
                                            className="px-3 py-1.5 rounded-lg border border-[var(--text-muted)]/20 bg-surface text-sm text-text-secondary hover:bg-accent/20 transition"
                                        >
                                            ฿{amount}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-text-muted">เพิ่มจำนวนเงินที่รับ</div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {CASH_ADD_AMOUNTS.map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => addCashAmount(amount)}
                                            className="py-1.5 rounded-lg border border-[var(--text-muted)]/20 bg-surface text-sm text-text-secondary hover:bg-accent/20 transition"
                                        >
                                            +{amount}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={clearPaidAmount}
                                className="w-full py-2 rounded-lg border border-[var(--text-muted)]/20 bg-surface text-sm text-text-secondary hover:bg-[var(--text-muted)]/30 transition"
                            >
                                ล้าง
                            </button>
                        </div>
                    )}

                    <div className="flex justify-between text-lg font-bold text-text-primary">
                        <span>ยอดรวมทั้งหมด</span>
                        <span>{formatPrice(total)}</span>
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
                        disabled={loading || cart.length === 0 || !canCashCheckout || isBusinessDayClosed}
                        className="mt-4 w-full py-3 rounded-xl text-xl font-bold bg-accent text-white hover:bg-accent-dark active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "กำลังปิดบิล..." : "ปิดบิล"}
                    </button>
                </div>
            </div>

            {receiptData ? (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 backdrop-blur-sm overflow-y-auto print:bg-white print:p-0 print:items-start print:justify-center"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="receipt-modal-title"
                >
                    <div className={`w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-[var(--text-muted)]/20 bg-surface shadow-2xl p-5 ${receiptPrintMode === "a4" ? "print:w-[150mm] print:max-w-[150mm]" : "print:w-[90mm] print:max-w-[90mm]"} print:mx-auto print:bg-white print:shadow-none print:rounded-none print:border-0 print:px-4 print:py-3 print:my-4 print:min-h-0 print:overflow-visible`}>
                        <div className="flex items-start justify-between gap-4 border-b border-[var(--text-muted)]/20 print:border-b print:pb-2 print:mb-2">
                            <div>
                                <h2 id="receipt-modal-title" className="text-2xl font-bold text-text-primary print:text-black print:text-base print:font-bold print:m-0 print:leading-tight">ใบเสร็จรับเงิน</h2>
                                <div className="text-sm text-text-muted print:text-gray-700 print:text-xs print:font-normal print:m-0 print:leading-tight">
                                    <div>
                                        {receiptShopName}
                                        {receiptBranchName ? ` - ${receiptBranchName}` : ""}
                                    </div>
                                    {receiptBranchAddress ? (
                                        <div className="break-words">{receiptBranchAddress}</div>
                                    ) : null}
                                    {receiptBranchPhone ? (
                                        <div className="break-words">โทร: {receiptBranchPhone}</div>
                                    ) : null}
                                    {receiptTaxId ? (
                                        <div className="break-words">เลขผู้เสียภาษี: {receiptTaxId}</div>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm text-text-muted print:text-gray-700 print:text-xs print:font-normal print:m-0">
                                    เลขที่ใบเสร็จ #{receiptData.orderId ? receiptData.orderId.slice(-8) : "XXXXXX"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setReceiptData(null)}
                                className="rounded-lg border border-[var(--text-muted)]/20 px-3 py-1.5 text-sm text-text-secondary hover:bg-[var(--text-muted)]/20 print:hidden"
                                aria-label="ปิดใบเสร็จ"
                            >
                                ปิด
                            </button>
                        </div>

                        <div className="print:p-0">
                            <div className="mb-4 rounded-xl border border-[var(--text-muted)]/20 bg-background/40 p-3 text-sm text-text-muted print:border-0 print:border-b print:border-dashed print:pb-1 print:mb-1 print:p-0 print:bg-white print:text-black">
                                <div className="flex justify-between gap-4 print:text-sm">
                                    <span>วันที่/เวลา</span>
                                    <span>{formatDateTime(receiptData.createdAt)}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-base font-semibold text-text-primary print:text-black print:text-sm print:font-bold print:pb-1">รายการสินค้า</div>
                                <div className="space-y-1">
                                    {receiptData.items.map((item, index) => (
                                        <div
                                            key={`${item.name}-${item.variantLabel}-${index}`}
                                            className="grid grid-cols-[1fr_auto] gap-1 text-sm print:border-0 print:bg-white print:text-black print:p-0 print:m-0"
                                        >
                                            <div className="min-w-0">
                                                <div className="font-medium text-text-primary print:text-black print:text-sm print:font-normal print:leading-tight">{item.name}</div>
                                                <div className="text-xs text-text-muted print:text-gray-700 print:text-xs print:leading-tight">
                                                    {item.variantLabel} · {item.qty} × {formatPrice(item.unitPrice)}
                                                </div>
                                            </div>

                                            <div className="text-right text-text-primary print:text-black print:text-sm">{formatPrice(item.lineTotal)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 space-y-1 rounded-xl border border-[var(--text-muted)]/20 bg-background/30 p-4 text-sm print:border-0 print:border-t print:border-dashed print:pt-1 print:mt-2 print:p-0 print:bg-white print:text-black">
                                <div className="flex justify-between text-text-secondary print:text-black print:text-sm">
                                    <span>ยอดรวม</span>
                                    <span className="font-semibold text-text-primary print:text-black print:text-sm print:font-bold">{formatPrice(receiptData.total)}</span>
                                </div>
                                <div className="flex justify-between text-text-secondary print:text-black print:text-sm">
                                    <span>วิธีจ่าย</span>
                                    <span className="font-semibold text-text-primary print:text-black print:text-sm print:font-bold">
                                        {paymentMethodLabel(receiptData.paymentMethod)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-text-secondary print:text-black print:text-sm">
                                    <span>รับเงิน</span>
                                    <span className="font-semibold text-text-primary print:text-black print:text-sm print:font-bold">{formatPrice(receiptData.paidAmount)}</span>
                                </div>
                                <div className="flex justify-between border-t border-[var(--text-muted)]/20 pt-2 text-base font-bold text-text-primary print:text-black print:text-sm print:font-bold print:border-dashed print:pt-1">
                                    <span>เงินทอน</span>
                                    <span>{formatPrice(receiptData.changeAmount)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-[var(--text-muted)]/20 pt-3 mt-3 print:border-dashed print:mt-2 print:pt-2">
                            {receiptFooter ? (
                                <div className="whitespace-pre-wrap break-words text-center text-sm text-text-primary print:text-black print:text-xs print:leading-tight">
                                    {receiptFooter}
                                </div>
) : (
                                <>
                                    <div className="text-center text-base font-medium text-text-primary print:text-black print:text-sm print:font-normal">
                                        ขอบคุณที่ใช้บริการ
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="mt-4 print:hidden">
                            <div className="text-xs text-text-muted mb-2">รูปแบบพิมพ์</div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setReceiptPrintMode("thermal")}
                                    className={[
                                        "flex-1 py-1.5 rounded-lg text-xs border transition",
                                        receiptPrintMode === "thermal"
                                            ? "bg-accent text-white border-accent"
                                            : "bg-surface border-[var(--text-muted)]/20 text-text-secondary hover:bg-accent/20",
                                    ].join(" ")}
                                >
                                    ใบเสร็จ 80mm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReceiptPrintMode("a4")}
                                    className={[
                                        "flex-1 py-1.5 rounded-lg text-xs border transition",
                                        receiptPrintMode === "a4"
                                            ? "bg-accent text-white border-accent"
                                            : "bg-surface border-[var(--text-muted)]/20 text-text-secondary hover:bg-accent/20",
                                    ].join(" ")}
                                >
                                    A4 / PDF
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-[var(--text-muted)]/20 p-5 sm:flex-row print:hidden">
                            <button
                                type="button"
                                onClick={() => setReceiptData(null)}
                                className="w-full rounded-xl border border-[var(--text-muted)]/20 bg-surface px-4 py-3 text-sm font-semibold text-text-primary hover:bg-[var(--text-muted)]/20"
                            >
                                เริ่มบิลใหม่
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
                            >
                                พิมพ์ใบเสร็จ
</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
