"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
    items: { variant_id: string; qty: number; sweetness: SweetnessLevel }[];
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
    id: string; // variant_id + sweetness
    variant_id: string;
    menu_id: string;
    menu_name: string;
    variant_label: string;
    serve_label?: string | null;
    sweetness?: SweetnessLevel | string;
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

  const shopObj = shops
    .map((x) => (isRecord(x) ? x : null))
    .find((x) =>
        Boolean(
        x &&
        typeof x.id === "string" &&
        x.id === shopId &&
        typeof x.name === "string",
      ),
    );
  const shopName =
    isRecord(shopObj) && typeof shopObj.name === "string" ? shopObj.name : null;

  const branchObj = branches
    .map((x) => (isRecord(x) ? x : null))
    .find((x) =>
        Boolean(
        x &&
        typeof x.id === "string" &&
        x.id === branchId &&
        typeof x.name === "string",
      ),
    );
  const branchName =
    isRecord(branchObj) && typeof branchObj.name === "string"
      ? branchObj.name
      : null;

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

function escapeReceiptHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        };
        return entities[character];
    });
}

function buildPosReceiptDocument({
    receipt,
    mode,
    shopName,
    branchName,
    branchAddress,
    branchPhone,
    taxId,
    footer,
}: {
    receipt: ReceiptData;
    mode: "thermal" | "a4";
    shopName: string;
    branchName: string | null;
    branchAddress: string | null;
    branchPhone: string | null;
    taxId: string | null;
    footer: string | null;
}) {
    const isA4 = mode === "a4";
    const receiptNumber = receipt.orderId ? receipt.orderId.slice(-8) : "XXXXXX";
    const shopTitle = branchName ? `${shopName} - ${branchName}` : shopName;
    const branchAddressHtml = branchAddress
        ? `<div class="meta">${escapeReceiptHtml(branchAddress)}</div>`
        : "";
    const branchPhoneHtml = branchPhone
        ? `<div class="meta">โทร: ${escapeReceiptHtml(branchPhone)}</div>`
        : "";
    const taxIdHtml = taxId
        ? `<div class="meta">เลขผู้เสียภาษี: ${escapeReceiptHtml(taxId)}</div>`
        : "";
    const footerHtml = footer
        ? `<div>${escapeReceiptHtml(footer)}</div>`
        : "<div>ขอบคุณที่ใช้บริการ</div>";
    const pageSize = isA4 ? "A4 portrait" : "80mm auto";
    const receiptWidth = isA4 ? "160mm" : "80mm";
    const receiptMargin = isA4 ? "16mm auto 0 auto" : "0 auto";
    const receiptPadding = isA4 ? "12mm" : "3mm";
    const baseFontSize = isA4 ? "14px" : "12px";
    const shopFontSize = isA4 ? "20px" : "14px";
    const headingFontSize = isA4 ? "16px" : "12px";
    const smallFontSize = isA4 ? "12px" : "10px";
    const dividerMargin = isA4 ? "12px 0" : "8px 0";
    const itemSpacing = isA4 ? "8px" : "5px";
    const summarySpacing = isA4 ? "6px" : "3px";
    const itemRows = receipt.items
        .map((item) => {
            const qty = Number.isFinite(item.qty) ? item.qty : 0;
            const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
      const lineTotal = Number.isFinite(item.lineTotal)
        ? item.lineTotal
        : unitPrice * qty;

            return `
                <div class="item-row">
                    <div class="item-name">
                        <div>${escapeReceiptHtml(item.name)}</div>
                        <div class="variant">${escapeReceiptHtml(item.variantLabel)} • ${qty} × ${escapeReceiptHtml(formatPrice(unitPrice))}</div>
                    </div>
                    <div class="item-price">${escapeReceiptHtml(formatPrice(lineTotal))}</div>
                </div>
            `;
        })
        .join("");

    return `<!doctype html>
<html lang="th">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ใบเสร็จ ${escapeReceiptHtml(receiptNumber)}</title>
        <style>
            @page { size: ${pageSize}; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff; color: #000; }
            body {
                width: 100%;
                margin: 0;
                font-family: Arial, "Noto Sans Thai", Tahoma, sans-serif;
                font-size: ${baseFontSize};
                line-height: 1.35;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .receipt {
                width: ${receiptWidth};
                max-width: ${receiptWidth};
                margin: ${receiptMargin};
                padding: ${receiptPadding};
                background: #fff;
            }
            .center { text-align: center; }
            .shop { font-size: ${shopFontSize}; font-weight: 700; overflow-wrap: anywhere; }
            .heading { margin-top: 3px; font-size: ${headingFontSize}; font-weight: 700; }
            .meta { margin-top: 2px; font-size: ${smallFontSize}; color: #444; overflow-wrap: anywhere; }
            .divider { margin: ${dividerMargin}; border-top: 1px dashed #777; }
            .item-row, .summary-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
            .item-row { break-inside: avoid; page-break-inside: avoid; }
            .item-row + .item-row { margin-top: ${itemSpacing}; }
            .item-name { min-width: 0; overflow-wrap: anywhere; }
            .item-price { flex: 0 0 auto; text-align: right; font-variant-numeric: tabular-nums; }
            .variant, .muted { color: #555; }
            .summary { display: grid; gap: ${summarySpacing}; }
            .summary-row span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
            .total { font-weight: 700; }
            .thanks { margin-top: 10px; padding-top: 7px; border-top: 1px dashed #777; font-size: ${smallFontSize}; white-space: pre-wrap; overflow-wrap: anywhere; }
        </style>
    </head>
    <body>
        <main class="receipt">
            <header class="center">
                <div class="shop">${escapeReceiptHtml(shopTitle)}</div>
                ${branchAddressHtml}
                ${branchPhoneHtml}
                ${taxIdHtml}
                <div class="heading">ใบเสร็จรับเงิน</div>
                <div class="meta">เลขที่ ${escapeReceiptHtml(receiptNumber)}</div>
                <div class="meta">${escapeReceiptHtml(formatDateTime(receipt.createdAt))}</div>
            </header>
            <div class="divider"></div>
            <section>${itemRows}</section>
            <div class="divider"></div>
            <section class="summary">
                <div class="summary-row total"><span>ยอดรวม</span><span>${escapeReceiptHtml(formatPrice(receipt.total))}</span></div>
                <div class="summary-row"><span>วิธีจ่าย</span><span>${escapeReceiptHtml(paymentMethodLabel(receipt.paymentMethod))}</span></div>
                <div class="summary-row"><span>รับเงิน</span><span>${escapeReceiptHtml(formatPrice(receipt.paidAmount))}</span></div>
                <div class="summary-row"><span>เงินทอน</span><span>${escapeReceiptHtml(formatPrice(receipt.changeAmount))}</span></div>
            </section>
            <footer class="thanks center">
                ${footerHtml}
            </footer>
        </main>
    </body>
</html>`;
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
const SWEETNESS_OPTIONS = ["0%", "25%", "50%", "75%", "100%", "125%"] as const;
type SweetnessLevel = (typeof SWEETNESS_OPTIONS)[number];
const DEFAULT_SWEETNESS: SweetnessLevel = "100%";
const LEGACY_SWEETNESS_MAP: Record<string, SweetnessLevel> = {
  ไม่หวาน: "0%",
  หวานน้อย: "75%",
  หวานครึ่ง: "50%",
  หวานปกติ: "100%",
  หวานมาก: "125%",
};

/* =========================
   UI helpers
========================= */
function serveLabel(v: PosVariant) {
    return v.serve_type?.name?.trim() ? v.serve_type!.name : "Default";
}

function normalizeSweetness(value: unknown): SweetnessLevel {
    if (typeof value !== "string") return DEFAULT_SWEETNESS;

    const raw = value.trim();
    const direct = SWEETNESS_OPTIONS.find((option) => option === raw);
    if (direct) return direct;

    const pct = raw.match(/(125|100|75|50|25|0)%/);
    if (pct) return pct[0] as SweetnessLevel;

    const withoutPrefix = raw.replace(/^หวาน\s*/, "").trim();
  const afterPrefix = SWEETNESS_OPTIONS.find(
    (option) => option === withoutPrefix,
  );
    if (afterPrefix) return afterPrefix;

  const exactLegacy =
    LEGACY_SWEETNESS_MAP[raw] ?? LEGACY_SWEETNESS_MAP[withoutPrefix];
    if (exactLegacy) return exactLegacy;

    for (const [legacy, next] of Object.entries(LEGACY_SWEETNESS_MAP)) {
        if (raw.includes(legacy)) return next;
    }

    return DEFAULT_SWEETNESS;
}

function isSweetnessLabelPart(value: string): boolean {
    const raw = value.trim();
    if (!raw) return false;
  if (
    SWEETNESS_OPTIONS.some((option) => raw === option || raw.includes(option))
  )
    return true;
    if (raw.startsWith("หวาน")) return true;
  return Object.keys(LEGACY_SWEETNESS_MAP).some((legacy) =>
    raw.includes(legacy),
  );
}

function normalizeServeLabel(serve: string | null | undefined) {
    const parts = String(serve ?? "")
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part && !isSweetnessLabelPart(part));

  const merged = parts
    .join(" / ")
    .replace(/\bdefault\b/gi, "")
    .trim();
    return merged || "Default";
}

function sweetnessLabel(sweetness: unknown) {
    return `หวาน ${normalizeSweetness(sweetness)}`;
}

function buildVariantLabel(serve: string, sweetness: unknown) {
    return `${normalizeServeLabel(serve)} / ${sweetnessLabel(sweetness)}`;
}

function cartLineId(variantId: string, serve: string, sweetness: unknown) {
    return `${variantId}::${normalizeServeLabel(serve)}::${normalizeSweetness(sweetness)}`;
}

function getCartServeLabel(item: CartItem) {
    return normalizeServeLabel(item.serve_label ?? item.variant_label);
}

function getCartVariantLabel(item: CartItem) {
  return buildVariantLabel(
    getCartServeLabel(item),
    item.sweetness ?? item.variant_label,
  );
}

function normalizeCartItem(item: CartItem): CartItem {
    const serve = getCartServeLabel(item);
    const sweetness = normalizeSweetness(item.sweetness ?? item.variant_label);
    return {
        ...item,
        id: cartLineId(item.variant_id, serve, sweetness),
        serve_label: serve,
        sweetness,
        variant_label: buildVariantLabel(serve, sweetness),
    };
}

function sameCartItems(a: CartItem[], b: CartItem[]) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => {
        const other = b[index];
        return (
            other &&
            item.id === other.id &&
            item.variant_id === other.variant_id &&
            item.serve_label === other.serve_label &&
            item.sweetness === other.sweetness &&
            item.variant_label === other.variant_label &&
            item.qty === other.qty
        );
    });
}

function normalizeCartItems(items: CartItem[]) {
    const merged = new Map<string, CartItem>();

    for (const item of items) {
        const normalized = normalizeCartItem(item);
        const existing = merged.get(normalized.id);
        if (existing) {
            merged.set(normalized.id, {
                ...existing,
                qty: existing.qty + normalized.qty,
            });
        } else {
            merged.set(normalized.id, normalized);
        }
    }

    return Array.from(merged.values());
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

export default function POSClient() {
    /* -------------------- STATE -------------------- */
    const [menu, setMenu] = useState<PosMenuItem[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(false);
    const idempotencyKeyRef = useRef<string | null>(null);
    const [feedError, setFeedError] = useState<string | null>(null);
    const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [lastTouchedVariantId, setLastTouchedVariantId] = useState<
    string | null
  >(null);
    const receiptPrintIframeRef = useRef<HTMLIFrameElement | null>(null);
    const feedbackTimerRef = useRef<number | null>(null);
    const lineFlashTimerRef = useRef<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "promptpay">(
    "cash",
  );
    const [paidAmount, setPaidAmount] = useState<string>("");
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptPrintMode, setReceiptPrintMode] = useState<"thermal" | "a4">(
    "thermal",
  );
  const [receiptSettings, setReceiptSettings] =
    useState<ReceiptSettings | null>(null);
  const [loadedReceiptDocument, setLoadedReceiptDocument] = useState<
    string | null
  >(null);
  const [configuredMenuId, setConfiguredMenuId] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const mobileAddLockRef = useRef(false);

    // key: menu_id -> variant_id
    const [variantPick, setVariantPick] = useState<Record<string, string>>({});
    // key: menu_id -> sweetness label
  const [sweetnessPick, setSweetnessPick] = useState<
    Record<string, SweetnessLevel>
  >({});

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
        const res = await fetch(
          `/api/daily-close?date=${encodeURIComponent(today)}`,
          {
                    cache: "no-store",
          },
        );

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
        const status =
          isRecord(close) && typeof close.status === "string"
            ? close.status
            : null;
                setDailyCloseStatus(status);
            } catch (err) {
                if (!alive) return;
        const message =
          err instanceof Error ? err.message : "โหลดสถานะปิดยอดวันไม่สำเร็จ";
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
      const okCat =
        activeCatId === "all" ? true : m.category?.id === activeCatId;
            if (!okCat) return false;

            if (!q) return true;
      const hay =
        `${m.name} ${m.description ?? ""} ${m.category?.name ?? ""}`.toLowerCase();
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
    [variantPick],
    );

    const getSelectedSweetness = useCallback(
    (menuId: string): SweetnessLevel =>
      normalizeSweetness(sweetnessPick[menuId]),
    [sweetnessPick],
  );

  const configuredMenu = useMemo(
    () => menu.find((item) => item.id === configuredMenuId) ?? null,
    [menu, configuredMenuId],
    );

  const closeMobileOverlays = useCallback(() => {
    setConfiguredMenuId(null);
    setMobileCartOpen(false);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) closeMobileOverlays();
    };
    handleChange(media);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [closeMobileOverlays]);

  useEffect(() => {
    const overlayOpen = configuredMenuId !== null || mobileCartOpen;
    if (!overlayOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [configuredMenuId, mobileCartOpen]);

  useEffect(() => {
    if (!configuredMenuId && !mobileCartOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (configuredMenuId) setConfiguredMenuId(null);
      else setMobileCartOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [configuredMenuId, mobileCartOpen]);

    useEffect(() => {
        setCart((prev) => {
            if (prev.length === 0) return prev;
            const next = normalizeCartItems(prev);
            return sameCartItems(prev, next) ? prev : next;
        });
    }, []);

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
    (
      item: PosMenuItem,
      variantId: string,
      sweetness = getSelectedSweetness(item.id),
    ) => {
            const variants = Array.isArray(item.variants) ? item.variants : [];
            const v = variants.find((x) => x.id === variantId) ?? null;
            if (!v) return;

            const base = toNumber(item.price, 0);
            const price = toNumber(v.price, base);
            const serve = normalizeServeLabel(serveLabel(v));
            const normalizedSweetness = normalizeSweetness(sweetness);
            const variantLabel = buildVariantLabel(serve, normalizedSweetness);
            const lineId = cartLineId(variantId, serve, normalizedSweetness);

            setCart((prev) => {
                const normalizedPrev = normalizeCartItems(prev);
                const exists = normalizedPrev.find((c) => c.id === lineId);
                if (exists) {
                    return normalizedPrev.map((c) =>
                        c.id === lineId
                            ? {
                                ...c,
                                qty: c.qty + 1,
                                serve_label: serve,
                                sweetness: normalizedSweetness,
                                variant_label: variantLabel,
                            }
              : c,
                    );
                }

                const next: CartItem = {
                    id: lineId,
                    variant_id: variantId,
                    menu_id: item.id,
                    menu_name: item.name,
                    variant_label: variantLabel,
                    serve_label: serve,
                    sweetness: normalizedSweetness,
                    price,
                    qty: 1,
                };

                return [...normalizedPrev, next];
            });

            pushFeedback(`เพิ่ม ${item.name} (${variantLabel})`, lineId);
        },
    [getSelectedSweetness, pushFeedback],
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
    [addVariantToCart, getSelectedVariant],
    );

    const increaseQty = useCallback((lineId: string) => {
        setCart((prev) =>
      prev.map((c) => (c.id === lineId ? { ...c, qty: c.qty + 1 } : c)),
        );
    }, []);

    const decreaseQty = useCallback((lineId: string) => {
        setCart((prev) =>
            prev
                .map((c) => (c.id === lineId ? { ...c, qty: c.qty - 1 } : c))
        .filter((c) => c.qty > 0),
        );
    }, []);

    const removeItem = useCallback((lineId: string) => {
        setCart((prev) => prev.filter((c) => c.id !== lineId));
    }, []);

    const clearCart = useCallback(() => setCart([]), []);

    /* -------------------- TOTAL -------------------- */
  const total = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.qty, 0),
    [cart],
  );
  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty, 0),
    [cart],
  );

    /* -------------------- CASH TENDER HELPERS -------------------- */
  const addCashAmount = useCallback(
    (amount: number) => {
        const current = parseNumberInput(paidAmount) ?? 0;
        setPaidAmount(String(current + amount));
    },
    [paidAmount],
  );

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
      (a, b) =>
        (lastIndex.get(b.menu_id) ?? 0) - (lastIndex.get(a.menu_id) ?? 0),
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
      if (!window.matchMedia("(min-width: 768px)").matches) return;
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
        if (cart.length > 0 && !loading && !isBusinessDayClosed)
          void checkout();
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
        alert(
          `เงินไม่พอ\nยอดรวม: ${formatPrice(total)}\nได้รับ: ${formatPrice(paid)}\nขาดอีก: ${formatPrice(total - paid)}`,
        );
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
                    sweetness: normalizeSweetness(c.sweetness ?? c.variant_label),
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
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current ?? "",
        },
                body: JSON.stringify(payload),
            });
      const debugText = await res
        .clone()
        .text()
        .catch(() => "");

            const raw: unknown = await res.json().catch(() => {
                console.error("⚠️ /api/pos returned non-JSON:", debugText);
                return null;
            });

      const data: PosCheckoutResponse = isRecord(raw)
        ? (raw as PosCheckoutResponse)
        : {};

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
            data,
          )}; raw=${rawDump}; text=${debugText}`,
                );

                if (data.code === "NO_RECIPE") {
          alert(
            "This item is not ready for sale. Ask the owner to add a recipe for this variant.",
          );
                    return;
                }

        if (
          data.code === "BUSINESS_DAY_CLOSED" &&
          typeof data.error === "string"
        ) {
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
        const msg =
          (typeof data.error === "string" && data.error) || "ปิดบิลล้มเหลว";
                alert(msg);
                return;
            }

      const order = isRecord(data.order)
        ? (data.order as Record<string, unknown>)
        : null;
      const orderIdRaw = order ? (order.id ?? order.order_id) : null;
            const orderId = orderIdRaw ? String(orderIdRaw) : "";
            const receiptPaidAmount =
        paymentMethod === "cash" ? (parseNumberInput(paidAmount) ?? 0) : total;
            const receiptChangeAmount =
                paymentMethod === "cash" ? receiptPaidAmount - total : 0;

            setReceiptData({
                orderId,
                createdAt: new Date().toISOString(),
                items: cart.map((c) => ({
                    name: c.menu_name,
                    variantLabel: getCartVariantLabel(c),
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
      setMobileCartOpen(false);
        } catch (err) {
            console.error("ปิดบิลผิดพลาด:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            // Clear active idempotency key only after request completes
            idempotencyKeyRef.current = null;
            setLoading(false);
        }
    }

  const receiptShopName =
    receiptSettings?.shopName ?? context.shopName ?? "Coffee SaaS";
    const receiptBranchName = receiptSettings?.branchName ?? context.branchName;
    const receiptBranchAddress = receiptSettings?.branchAddress ?? null;
    const receiptBranchPhone = receiptSettings?.branchPhone ?? null;
    const receiptTaxId = receiptSettings?.taxId ?? null;
    const receiptFooter = receiptSettings?.receiptFooter ?? null;

    const receiptPrintDocument = useMemo(() => {
        if (!receiptData) return "";

        return buildPosReceiptDocument({
            receipt: receiptData,
            mode: receiptPrintMode,
            shopName: receiptShopName,
            branchName: receiptBranchName ?? null,
            branchAddress: receiptBranchAddress,
            branchPhone: receiptBranchPhone,
            taxId: receiptTaxId,
            footer: receiptFooter,
        });
    }, [
        receiptData,
        receiptPrintMode,
        receiptShopName,
        receiptBranchName,
        receiptBranchAddress,
        receiptBranchPhone,
        receiptTaxId,
        receiptFooter,
    ]);
    const receiptPrintIframeLoaded =
        receiptData !== null &&
        receiptPrintDocument.trim().length > 0 &&
        loadedReceiptDocument === receiptPrintDocument;

    const printReceipt = useCallback(() => {
        if (!receiptPrintDocument.trim()) {
            console.warn("[POS receipt] Receipt print document is empty.");
            return;
        }

        if (!receiptPrintIframeLoaded) {
            console.warn("[POS receipt] Receipt print document is not ready yet.");
            return;
        }

        const iframe = receiptPrintIframeRef.current;
        if (!iframe?.contentWindow) {
            console.warn("[POS receipt] Receipt print iframe is unavailable.");
            return;
        }

        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, [receiptPrintDocument, receiptPrintIframeLoaded]);

    const closeReceipt = useCallback(() => {
        setLoadedReceiptDocument(null);
        setReceiptData(null);
    }, []);

    const selectReceiptPrintMode = useCallback(
        (nextMode: "thermal" | "a4") => {
            if (nextMode === receiptPrintMode) return;
            setLoadedReceiptDocument(null);
            setReceiptPrintMode(nextMode);
        },
    [receiptPrintMode],
    );

    /* -------------------- RENDER -------------------- */
    return (
    <div className="flex min-h-full flex-col bg-background pb-24 md:h-screen md:flex-row md:pb-0 text-text-primary">
            {feedbackText ? (
                <div className="fixed right-2 top-2 z-50 rounded-lg border border-accent/50 bg-surface/95 px-2.5 py-1.5 text-xs text-text-primary shadow-xl backdrop-blur pointer-events-none">
                    {feedbackText}
                </div>
            ) : null}

            {/* LEFT: Menu List */}
      <div className="flex-none border-b p-3 md:min-h-0 md:w-[58%] md:flex-none md:overflow-y-auto md:border-r md:p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="rounded-full border border-[var(--text-muted)]/20 bg-surface px-2 py-1">
                        Shop: {context.shopName ?? context.shopId ?? "-"}
                    </span>
                    <span className="rounded-full border border-[var(--text-muted)]/20 bg-surface px-2 py-1">
                        Branch: {context.branchName ?? context.branchId ?? "Not selected"}
                    </span>
                </div>
                <div className="flex flex-col gap-3 mb-4">
          <h2 className="text-xl lg:text-2xl font-bold text-text-primary">
            เมนูทั้งหมด
          </h2>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหาเมนู..."
                            className="w-full sm:w-64 px-3 py-2.5 lg:py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary placeholder:text-text-muted"
                        />

                        <select
                            value={activeCatId}
                            onChange={(e) => setActiveCatId(e.target.value)}
                            className="w-full sm:w-auto px-3 py-2.5 lg:py-2 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary"
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
                    <div className="mb-2 lg:mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 lg:p-3 text-sm text-red-600">
                        {feedError}
                    </div>
                ) : null}

                {filteredMenu.length === 0 ? (
                        <div className="rounded-xl border border-[var(--text-muted)]/20 bg-surface p-3 lg:p-4 text-sm text-text-secondary">
                        {menu.length === 0
                            ? "ยังไม่มีเมนูที่พร้อมขายในสาขานี้ (ต้องเปิดเมนูในสาขา และมีสูตรใน variant อย่างน้อย 1 ตัว)"
                            : "ไม่พบเมนูตามตัวกรองที่เลือก"}
                    </div>
                ) : null}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] md:gap-4">
                    {filteredMenu.map((item) => {
                        const variants = Array.isArray(item.variants) ? item.variants : [];
                        const selectedVariant = getSelectedVariant(item);
                        const selectedSweetness = getSelectedSweetness(item.id);

                        return (
              <React.Fragment key={item.id}>
                <button
                  type="button"
                  onClick={() => setConfiguredMenuId(item.id)}
                  className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-[var(--text-muted)]/25 bg-surface p-3 text-left shadow-sm transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
                  aria-label={`เลือก ${item.name}`}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    {item.category?.name ? (
                      <span className="block text-xs text-text-muted">
                        {item.category.name}
                      </span>
                    ) : null}
                    <span className="block break-words font-bold leading-snug text-text-primary">
                      {item.name}
                    </span>
                    <span className="mt-1 block text-sm font-medium text-text-secondary">
                      เริ่มต้น {formatPrice(getMinVariantPrice(item))}
                    </span>
                  </span>
                  <span className="flex min-h-11 shrink-0 items-center rounded-lg bg-accent px-3 text-sm font-bold text-white">
                    เลือก
                  </span>
                </button>

                            <div
                                onClick={() => addToCart(item)}
                  className="hidden min-w-0 cursor-pointer flex-col rounded-2xl border border-[var(--text-muted)]/25 bg-surface p-4 shadow-sm transition hover:border-accent/50 hover:shadow-md focus-within:border-accent/60 md:flex"
                                title="คลิกเพื่อเพิ่ม"
                            >
                                <div className="flex items-start justify-between gap-4 border-b border-[var(--text-muted)]/15 pb-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="break-words text-lg font-bold leading-snug text-text-primary">
                                            {item.name}
                                        </div>
                                        <div className="mt-1 font-medium text-text-secondary">
                                            เริ่มต้น {formatPrice(getMinVariantPrice(item))}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            addToCart(item);
                                        }}
                      className="min-h-11 shrink-0 rounded-xl border border-accent bg-accent px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                        aria-label={`เพิ่ม ${item.name} ตัวเลือกปัจจุบันลงตะกร้า`}
                                    >
                                        + เพิ่ม
                                    </button>
                                </div>
                                <div className="mt-4">
                    <div className="mb-2 text-sm font-bold text-text-primary">
                      อุณหภูมิ
                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                    {variants.length === 0 ? (
                        <span className="col-span-full text-sm text-text-muted">
                          ไม่มีตัวเลือกอุณหภูมิ
                        </span>
                                    ) : (
                        variants.map((variant) => {
                          const active = selectedVariant?.id === variant.id;
                                            return (
                                                <button
                              key={variant.id}
                                                    type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                                        setVariantPick((prev) => ({
                                                            ...prev,
                                  [item.id]: variant.id,
                                                        }));
                                addVariantToCart(item, variant.id);
                                                    }}
                                                        className={[
                                "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                                            active
                                                                ? "border-accent bg-accent text-white shadow-sm ring-2 ring-accent/30"
                                                                : "border-[var(--text-muted)]/30 bg-background text-text-secondary hover:border-accent/50 hover:bg-accent/10",
                                                        ].join(" ")}
                                                    aria-pressed={active}
                              aria-label={`${serveLabel(variant)} เลือกและเพิ่มลงตะกร้า`}
                                                >
                              {active ? (
                                <span aria-hidden="true">✓</span>
                              ) : null}
                              <span className="min-w-0 break-words">
                                {serveLabel(variant)}
                              </span>
                                                </button>
                                            );
                                        })
                                    )}
                                    </div>
                                </div>
                                <div className="mt-5">
                    <div className="mb-2 text-sm font-bold text-text-primary">
                      ระดับความหวาน
                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {SWEETNESS_OPTIONS.map((option) => {
                                            const active = selectedSweetness === option;
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                                                        setSweetnessPick((prev) => ({
                                                            ...prev,
                                                            [item.id]: option,
                                                        }));
                                                    }}
                                                    className={[
                              "flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                                        active
                                                            ? "border-accent bg-accent text-white shadow-sm ring-2 ring-accent/30"
                                                            : "border-[var(--text-muted)]/30 bg-background text-text-secondary hover:border-accent/50 hover:bg-accent/10",
                                                    ].join(" ")}
                                                    aria-pressed={active}
                                                    aria-label={`ความหวาน ${option}`}
                                                >
                                                    {active ? <span aria-hidden="true">✓</span> : null}
                            {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5">
                    <div className="text-xs font-medium text-text-muted">
                      ตัวเลือกปัจจุบัน
                    </div>
                    <div
                      className="mt-0.5 font-bold text-text-primary"
                      aria-live="polite"
                    >
                      {selectedVariant
                        ? normalizeServeLabel(serveLabel(selectedVariant))
                        : "ยังไม่เลือก"}
                      {selectedVariant
                        ? ` • ${sweetnessLabel(selectedSweetness)}`
                        : ""}
                                    </div>
                                </div>
                                <div className="mt-3 text-sm leading-relaxed text-text-muted">
                    ปุ่มอุณหภูมิจะเลือกและเพิ่มทันที หรือกด “+ เพิ่ม”
                    เพื่อเพิ่มตัวเลือกปัจจุบัน
                                </div>
                            </div>
              </React.Fragment>
                        );
                    })}
                </div>
            </div>

      {configuredMenu ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/55 md:hidden"
          onClick={() => setConfiguredMenuId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-configurator-title"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--text-muted)]/20 bg-surface pb-3">
              <div className="min-w-0">
                <div className="text-xs text-text-muted">ตั้งค่ารายการ</div>
                <h2
                  id="mobile-configurator-title"
                  className="break-words text-xl font-bold text-text-primary"
                >
                  {configuredMenu.name}
                </h2>
                <div className="font-semibold text-text-secondary">
                  {formatPrice(
                    toNumber(
                      getSelectedVariant(configuredMenu)?.price,
                      configuredMenu.price,
                    ),
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfiguredMenuId(null)}
                className="min-h-11 min-w-11 rounded-xl border border-[var(--text-muted)]/30 text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="ปิดตัวเลือก"
              >
                ×
              </button>
            </header>
            <div className="mt-4 space-y-5">
              <fieldset>
                <legend className="mb-2 font-bold text-text-primary">
                  อุณหภูมิ
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {configuredMenu.variants.map((variant) => {
                    const active =
                      getSelectedVariant(configuredMenu)?.id === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() =>
                          setVariantPick((prev) => ({
                            ...prev,
                            [configuredMenu.id]: variant.id,
                          }))
                        }
                        aria-pressed={active}
                        className={[
                          "min-h-11 rounded-xl border px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          active
                            ? "border-accent bg-accent text-white ring-2 ring-accent/30"
                            : "border-[var(--text-muted)]/30 bg-background text-text-secondary",
                        ].join(" ")}
                      >
                        {active ? <span aria-hidden="true">✓ </span> : null}
                        {serveLabel(variant)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 font-bold text-text-primary">
                  ระดับความหวาน
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {SWEETNESS_OPTIONS.map((option) => {
                    const active =
                      getSelectedSweetness(configuredMenu.id) === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setSweetnessPick((prev) => ({
                            ...prev,
                            [configuredMenu.id]: option,
                          }))
                        }
                        aria-pressed={active}
                        className={[
                          "min-h-11 rounded-xl border px-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          active
                            ? "border-accent bg-accent text-white ring-2 ring-accent/30"
                            : "border-[var(--text-muted)]/30 bg-background text-text-secondary",
                        ].join(" ")}
                      >
                        {active ? <span aria-hidden="true">✓ </span> : null}
                        {option}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div
                className="rounded-xl border border-accent/30 bg-accent/10 p-3"
                aria-live="polite"
              >
                <div className="text-xs text-text-muted">ตัวเลือกปัจจุบัน</div>
                <div className="font-bold text-text-primary">
                  {getSelectedVariant(configuredMenu)
                    ? normalizeServeLabel(
                        serveLabel(getSelectedVariant(configuredMenu)!),
                      )
                    : "ยังไม่เลือก"}{" "}
                  • {sweetnessLabel(getSelectedSweetness(configuredMenu.id))}
                </div>
              </div>
              <button
                type="button"
                disabled={
                  mobileAddLockRef.current ||
                  !getSelectedVariant(configuredMenu)
                }
                onClick={(event) => {
                  event.stopPropagation();
                  if (mobileAddLockRef.current) return;
                  mobileAddLockRef.current = true;
                  addToCart(configuredMenu);
                  setConfiguredMenuId(null);
                  window.setTimeout(() => {
                    mobileAddLockRef.current = false;
                  }, 0);
                }}
                className="min-h-12 w-full rounded-xl bg-accent px-4 text-lg font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
              >
                เพิ่มลงตะกร้า
              </button>
            </div>
          </section>
        </div>
      ) : null}

            {/* RIGHT: Cart */}
      <div
        className={`${mobileCartOpen ? "flex" : "hidden"} fixed inset-0 z-40 flex-col overflow-y-auto bg-background p-3 pb-28 md:static md:z-auto md:flex md:min-h-0 md:w-[42%] md:flex-none md:overflow-y-auto md:p-4`}
        role={mobileCartOpen ? "dialog" : undefined}
        aria-modal={mobileCartOpen ? "true" : undefined}
        aria-labelledby="cart-title"
      >
        <div className="flex flex-row items-center justify-between gap-2 lg:gap-3 mb-3 lg:mb-4">
          <button
            type="button"
            onClick={() => setMobileCartOpen(false)}
            className="min-h-11 min-w-11 rounded-xl border border-[var(--text-muted)]/30 md:hidden"
            aria-label="ปิดตะกร้า"
          >
            ←
          </button>
          <h2
            id="cart-title"
            className="text-xl lg:text-2xl font-bold text-text-primary"
          >
            ตะกร้า
          </h2>
          <span className="text-sm text-text-muted md:hidden">
            {cartItemCount} ชิ้น
          </span>
          <div className="hidden text-xs text-text-muted md:block">
            Enter = ปิดบิล • Esc = ล้างตะกร้า
          </div>
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

                <div className="space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:space-y-3">
                    {groupedCart.length === 0 ? (
            <div className="space-y-3 p-4 rounded-xl border border-[var(--text-muted)]/20 bg-surface text-text-muted">
              <p>ยังไม่มีรายการในตะกร้า</p>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="min-h-11 w-full rounded-xl border border-accent px-3 font-semibold text-accent md:hidden"
              >
                กลับไปเลือกเมนู
              </button>
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

                  <div className="font-bold text-text-primary">
                    {formatPrice(g.groupTotal)}
                  </div>
                                </div>

                                <div className="mt-2 lg:mt-3 space-y-2 lg:space-y-2">
                                    {g.lines
                                        .slice()
                    .sort((a, b) =>
                      getCartVariantLabel(a).localeCompare(
                        getCartVariantLabel(b),
                      ),
                    )
                                        .map((it) => (
                                            <div
                                                key={it.id}
                                                className={[
                                                    "flex items-center justify-between gap-2 lg:gap-3 rounded-md px-2 py-2 transition",
                                                    lastTouchedVariantId === it.id
                                                        ? "bg-accent/15 ring-1 ring-accent/50"
                                                        : "",
                                                ].join(" ")}
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm text-text-secondary break-words">
                                                        • {it.menu_name} / {getCartVariantLabel(it)}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {it.qty} × {formatPrice(it.price)}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => decreaseQty(it.id)}
                                                        className="h-9 w-9 rounded-md bg-accent/20 text-text-primary active:scale-[0.98]"
                                                    >
                                                        -
                                                    </button>

                                                    <span className="min-w-7 text-center text-sm text-text-primary">
                                                        {it.qty}
                                                    </span>

                                                    <button
                                                        onClick={() => increaseQty(it.id)}
                                                        className="h-9 w-9 rounded-md bg-accent/20 text-text-primary active:scale-[0.98]"
                                                    >
                                                        +
                                                    </button>

                                                    <button
                                                        onClick={() => removeItem(it.id)}
                                                        className="px-3 h-9 text-sm rounded-md bg-[var(--text-muted)]/20 text-text-secondary hover:bg-[var(--text-muted)]/30 active:scale-[0.98]"
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

                <div className="mt-3 border-t border-[var(--text-muted)]/20 pt-3 lg:mt-4 lg:pt-4 space-y-2 lg:space-y-3">
                    <div className="text-xs text-text-muted">วิธีจ่ายเงิน</div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPaymentMethod("cash")}
                            className={[
                                "flex-1 py-2.5 rounded-lg text-sm border transition",
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
                                "flex-1 py-2.5 rounded-lg text-sm border transition",
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
                                className="w-full px-3 py-2.5 rounded-lg bg-surface border border-[var(--text-muted)]/20 text-text-primary"
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

                            <div className="space-y-1.5 lg:space-y-2 pt-1">
                <div className="text-xs text-text-muted">
                  รับเงินอย่างรวดเร็ว
                </div>
                                <div className="flex flex-wrap gap-1.5 lg:gap-2">
                                    <button
                                        type="button"
                                        onClick={setExactCash}
                                        className="px-2.5 py-1.5 lg:px-3 lg:py-2 text-sm rounded-lg border border-[var(--text-muted)]/20 bg-surface text-text-secondary hover:bg-accent/20 transition"
                                    >
                                        พอดี ฿{total}
                                    </button>
                  {CASH_PRESET_AMOUNTS.filter((a) => a >= total).map(
                    (amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => setCashPreset(amount)}
                                            className="px-2.5 py-1.5 lg:px-3 lg:py-2 text-sm rounded-lg border border-[var(--text-muted)]/20 bg-surface text-text-secondary hover:bg-accent/20 transition"
                                        >
                                            ฿{amount}
                                        </button>
                    ),
                  )}
                                </div>
                            </div>

                            <div className="space-y-1.5 lg:space-y-2">
                <div className="text-xs text-text-muted">
                  เพิ่มจำนวนเงินที่รับ
                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 lg:gap-2">
                                    {CASH_ADD_AMOUNTS.map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => addCashAmount(amount)}
                                            className="py-1.5 text-sm rounded-lg border border-[var(--text-muted)]/20 bg-surface text-text-secondary hover:bg-accent/20 transition"
                                        >
                                            +{amount}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={clearPaidAmount}
                                className="w-full py-2 lg:py-2.5 rounded-lg border border-[var(--text-muted)]/20 bg-surface text-sm text-text-secondary hover:bg-[var(--text-muted)]/30 transition"
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
                        className="mt-3 w-full py-3 rounded-lg bg-[var(--text-muted)]/20 text-text-secondary hover:bg-[var(--text-muted)]/30 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ลบสินค้าทั้งหมด
                    </button>

                    <button
                        onClick={() => void checkout()}
            disabled={
              loading ||
              cart.length === 0 ||
              !canCashCheckout ||
              isBusinessDayClosed
            }
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex min-h-14 items-center justify-between rounded-xl bg-accent px-4 text-lg font-bold text-white shadow-2xl transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:static md:mt-4 md:block md:w-full md:py-3.5 md:text-xl md:shadow-none"
                    >
            <span className="md:hidden">ยอดรวม {formatPrice(total)}</span>
            <span>{loading ? "กำลังปิดบิล..." : "ปิดบิล"}</span>
                    </button>
                </div>
            </div>

      {cart.length > 0 && !configuredMenu && !mobileCartOpen ? (
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex min-h-14 items-center justify-between rounded-2xl bg-accent px-4 text-left text-white shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 md:hidden"
          aria-label={`ดูตะกร้า ${cartItemCount} ชิ้น ยอดรวม ${formatPrice(total)}`}
        >
          <span>
            <span className="block font-bold">ตะกร้า {cartItemCount} ชิ้น</span>
            <span className="text-sm">{formatPrice(total)}</span>
          </span>
          <span className="font-bold">ดูตะกร้า →</span>
        </button>
      ) : null}

            {receiptData ? (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-3 lg:p-4 backdrop-blur-sm overflow-y-auto print:bg-white print:p-0 print:items-start print:justify-center"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="receipt-modal-title"
                >
          <div
            className={`w-full max-w-xl max-h-[calc(100vh-2.5rem)] lg:max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-[var(--text-muted)]/20 bg-surface shadow-2xl p-4 lg:p-5 ${receiptPrintMode === "a4" ? "print:w-[150mm] print:max-w-[150mm]" : "print:w-[80mm] print:max-w-[80mm]"} print:mx-auto print:bg-white print:shadow-none print:rounded-none print:border-0 print:px-4 print:py-3 print:my-4 print:min-h-0 print:overflow-visible`}
          >
                        <div className="flex items-start justify-between gap-4 border-b border-[var(--text-muted)]/20 print:border-b print:pb-2 print:mb-2">
                            <div>
                <h2
                  id="receipt-modal-title"
                  className="text-xl lg:text-2xl font-bold text-text-primary print:text-black print:text-base print:font-bold print:m-0 print:leading-tight"
                >
                  ใบเสร็จรับเงิน
                </h2>
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
                    <div className="break-words">
                      เลขผู้เสียภาษี: {receiptTaxId}
                    </div>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm text-text-muted print:text-gray-700 print:text-xs print:font-normal print:m-0">
                  เลขที่ใบเสร็จ #
                  {receiptData.orderId
                    ? receiptData.orderId.slice(-8)
                    : "XXXXXX"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeReceipt}
                                className="rounded-lg border border-[var(--text-muted)]/20 px-2.5 py-1.5 lg:px-3 lg:py-1.5 text-sm text-text-secondary hover:bg-[var(--text-muted)]/20 print:hidden"
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
                <div className="text-base font-semibold text-text-primary print:text-black print:text-sm print:font-bold print:pb-1">
                  รายการสินค้า
                </div>
                                <div className="space-y-1">
                                    {receiptData.items.map((item, index) => (
                                        <div
                                            key={`${item.name}-${item.variantLabel}-${index}`}
                                            className="grid grid-cols-[1fr_auto] gap-1 text-sm print:border-0 print:bg-white print:text-black print:p-0 print:m-0"
                                        >
                                            <div className="min-w-0">
                        <div className="font-medium text-text-primary print:text-black print:text-sm print:font-normal print:leading-tight">
                          {item.name}
                        </div>
                                                <div className="text-xs text-text-muted print:text-gray-700 print:text-xs print:leading-tight">
                          {item.variantLabel} · {item.qty} ×{" "}
                          {formatPrice(item.unitPrice)}
                                                </div>
                                            </div>

                      <div className="text-right text-text-primary print:text-black print:text-sm">
                        {formatPrice(item.lineTotal)}
                      </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 space-y-1 rounded-xl border border-[var(--text-muted)]/20 bg-background/30 p-4 text-sm print:border-0 print:border-t print:border-dashed print:pt-1 print:mt-2 print:p-0 print:bg-white print:text-black">
                                <div className="flex justify-between text-text-secondary print:text-black print:text-sm">
                                    <span>ยอดรวม</span>
                  <span className="font-semibold text-text-primary print:text-black print:text-sm print:font-bold">
                    {formatPrice(receiptData.total)}
                  </span>
                                </div>
                                <div className="flex justify-between text-text-secondary print:text-black print:text-sm">
                                    <span>วิธีจ่าย</span>
                                    <span className="font-semibold text-text-primary print:text-black print:text-sm print:font-bold">
                                        {paymentMethodLabel(receiptData.paymentMethod)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-text-secondary print:text-black print:text-sm">
                                    <span>รับเงิน</span>
                  <span className="font-semibold text-text-primary print:text-black print:text-sm print:font-bold">
                    {formatPrice(receiptData.paidAmount)}
                  </span>
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
                                    onClick={() => selectReceiptPrintMode("thermal")}
                                className={[
                                    "flex-1 py-1.5 lg:py-2 text-xs rounded-lg border transition",
                                    receiptPrintMode === "thermal"
                                        ? "bg-accent text-white border-accent"
                                        : "bg-surface border-[var(--text-muted)]/20 text-text-secondary hover:bg-accent/20",
                                ].join(" ")}
                                >
                                    ใบเสร็จ 80mm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => selectReceiptPrintMode("a4")}
                                className={[
                                    "flex-1 py-1.5 lg:py-2 text-xs rounded-lg border transition",
                                    receiptPrintMode === "a4"
                                        ? "bg-accent text-white border-accent"
                                        : "bg-surface border-[var(--text-muted)]/20 text-text-secondary hover:bg-accent/20",
                                ].join(" ")}
                                >
                                    A4 / PDF
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-[var(--text-muted)]/20 p-4 lg:p-5 sm:flex-row print:hidden">
                            <button
                                type="button"
                                onClick={closeReceipt}
                                className="w-full rounded-xl border border-[var(--text-muted)]/20 bg-surface px-4 py-2.5 lg:py-3 text-sm font-semibold text-text-primary hover:bg-[var(--text-muted)]/20"
                            >
                                เริ่มบิลใหม่
                            </button>
                            <button
                                type="button"
                                onClick={printReceipt}
                                disabled={!receiptPrintIframeLoaded}
                                className="w-full rounded-xl bg-accent px-4 py-2.5 lg:py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                พิมพ์ใบเสร็จ
                            </button>
                        </div>
                    </div>
                    <iframe
                        ref={receiptPrintIframeRef}
                        title="ตัวอย่างใบเสร็จสำหรับพิมพ์"
                        srcDoc={receiptPrintDocument}
                        onLoad={() => {
                            if (receiptPrintDocument.trim()) {
                                setLoadedReceiptDocument(receiptPrintDocument);
                            }
                        }}
                        aria-hidden="true"
                        tabIndex={-1}
                        className="pointer-events-none fixed left-[-10000px] top-0 max-w-none border-0 bg-white opacity-0"
                        style={{
                            width: receiptPrintMode === "a4" ? "210mm" : "80mm",
                            height: receiptPrintMode === "a4" ? "297mm" : "65vh",
                        }}
                    />
                </div>
            ) : null}
        </div>
    );
}
