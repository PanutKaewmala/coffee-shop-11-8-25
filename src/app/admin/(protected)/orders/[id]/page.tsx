// app/admin/orders/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Copy, Check, X, AlertTriangle, Printer } from "lucide-react";

import Card from "@/components/admin/Card";
import type { ReceiptSettings } from "@/lib/types";

/* =========================
   Type guards + readers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function readString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}
function readNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function parseReceiptSettings(v: unknown): ReceiptSettings | null {
    if (!isRecord(v)) return null;

    const shopId = readString(v.shopId);
    const shopName = readString(v.shopName);
    if (!shopId || !shopName) return null;

    return {
        shopId,
        shopName,
        taxId: readString(v.taxId),
        receiptFooter: readString(v.receiptFooter),
        branchId: readString(v.branchId),
        branchName: readString(v.branchName),
        branchAddress: readString(v.branchAddress),
        branchPhone: readString(v.branchPhone),
        canEditShopSettings: v.canEditShopSettings === true,
    };
}

function parseNavbarReceiptContext(v: unknown): {
    shopName: string | null;
    branchName: string | null;
} {
    if (!isRecord(v)) return { shopName: null, branchName: null };

    const currentShopId = readString(v.currentShopId);
    const currentBranchId = readString(v.currentBranchId);
    const shops = Array.isArray(v.shops) ? v.shops : [];
    const branches = Array.isArray(v.branches) ? v.branches : [];

    const currentShop = shops.find(
        (shop) => isRecord(shop) && readString(shop.id) === currentShopId
    );
    const currentBranch = branches.find(
        (branch) => isRecord(branch) && readString(branch.id) === currentBranchId
    );

    return {
        shopName: isRecord(currentShop) ? readString(currentShop.name) : null,
        branchName: isRecord(currentBranch) ? readString(currentBranch.name) : null,
    };
}

/* =========================
   Cancel constants (backend expects reason)
========================= */
type CancelReason =
    | "ลูกค้ายกเลิก"
    | "กดผิด / ชงผิด"
    | "วัตถุดิบไม่พอ"
    | "ระบบขัดข้อง"
    | "อื่นๆ";

function reasonFromRestock(restock: boolean): CancelReason {
    // ✅ ไม่ให้ user เลือกแล้ว -> map จากการตัดสินใจคืน/ไม่คืน
    return restock ? "ลูกค้ายกเลิก" : "กดผิด / ชงผิด";
}

function normalizeNote(note: string): string {
    const t = note.trim();
    if (!t) return "";
    return t.length > 200 ? t.slice(0, 200) : t;
}

/* =========================
   Local UI types
========================= */
type UIOrderItem = {
    id: string;
    name: string;
    price: number;
    qty: number;
    variant_label: string | null;
};

type UIOrderDetail = {
    id: string;
    total: number;
    created_at: string;
    items: UIOrderItem[];

    status?: string;
    payment_method?: string;
    paid_amount?: number | null;
    change_amount?: number | null;
    paid_at?: string | null;

    // legacy note
    note?: string | null;

    // cancel fields (new)
    cancel_reason?: string | null;
    cancel_note?: string | null;
    cancelled_at?: string | null;
    cancelled_by?: string | null;

    // optional flags if you later return them
    stock_refunded?: boolean | null;
    stock_refunded_at?: string | null;
};

function parseUIOrderItem(v: unknown): UIOrderItem | null {
    if (!isRecord(v)) return null;

    const id = readString(v.id) ?? "";
    const name = readString(v.name) ?? "";
    if (!id || !name) return null;

    const price = readNumber(v.price, 0);
    const qty = readNumber(v.qty, 0);

    const variant_label =
        typeof v.variant_label === "string"
            ? v.variant_label
            : typeof (v as Record<string, unknown>).variant_name === "string"
                ? String((v as Record<string, unknown>).variant_name)
                : null;

    return { id, name, price, qty, variant_label };
}

function parseUIOrderDetail(raw: unknown): UIOrderDetail | null {
    if (!isRecord(raw)) return null;

    const id = readString(raw.id) ?? "";
    const created_at = readString(raw.created_at) ?? "";
    if (!id || !created_at) return null;

    const total = readNumber(raw.total, 0);
    const status = readString(raw.status) ?? undefined;
    const payment_method = readString(raw.payment_method) ?? undefined;
    const paid_amount = (() => {
        const rawVal = (raw as Record<string, unknown>).paid_amount;
        if (typeof rawVal === "number") return rawVal;
        const n = Number(rawVal);
        return Number.isFinite(n) ? n : null;
    })();
    const change_amount = (() => {
        const rawVal = (raw as Record<string, unknown>).change_amount;
        if (typeof rawVal === "number") return rawVal;
        const n = Number(rawVal);
        return Number.isFinite(n) ? n : null;
    })();
    const paid_at = readString(raw.paid_at) ?? null;

    const note = readString(raw.note) ?? null;

    const cancel_reason = readString((raw as Record<string, unknown>).cancel_reason) ?? null;
    const cancel_note = readString((raw as Record<string, unknown>).cancel_note) ?? null;
    const cancelled_at = readString((raw as Record<string, unknown>).cancelled_at) ?? null;
    const cancelled_by = readString((raw as Record<string, unknown>).cancelled_by) ?? null;

    const stock_refunded_raw = (raw as Record<string, unknown>).stock_refunded;
    const stock_refunded = typeof stock_refunded_raw === "boolean" ? stock_refunded_raw : null;
    const stock_refunded_at = readString((raw as Record<string, unknown>).stock_refunded_at) ?? null;

    const rawItems = Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.order_items)
            ? raw.order_items
            : [];

    const items = rawItems.map(parseUIOrderItem).filter((x): x is UIOrderItem => x !== null);

    return {
        id,
        total,
        created_at,
        items,
        status,
        payment_method,
        paid_amount,
        change_amount,
        paid_at,
        note,
        cancel_reason,
        cancel_note,
        cancelled_at,
        cancelled_by,
        stock_refunded,
        stock_refunded_at,
    };
}

function extractOrderFromResponse(data: unknown): UIOrderDetail | null {
    if (isRecord(data) && "order" in data) {
        const orderRaw = (data as Record<string, unknown>).order;
        return parseUIOrderDetail(orderRaw);
    }
    return parseUIOrderDetail(data);
}

/* =========================
   UI helpers
========================= */
function shortId(id: string, head = 6, tail = 6) {
    if (!id) return "-";
    if (id.length <= head + tail + 3) return id;
    return `${id.slice(0, head)}...${id.slice(-tail)}`;
}
function fmtMoney(v: number) {
    const n = Number.isFinite(v) ? v : 0;
    return n.toLocaleString("th-TH");
}
function fmtDateTH(iso: string) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}
function cleanVariant(v: string | null) {
    const s = (v ?? "").trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (low === "default" || s === "-" || low === "none") return null;
    return s;
}

function useOrderId(): string | null {
    const params = useParams();
    return useMemo(() => {
        const raw = (params as Record<string, string | string[] | undefined>)?.id;
        if (typeof raw === "string") return raw;
        if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
        return null;
    }, [params]);
}

/* =========================
   UI parts
========================= */
function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-text-secondary">
            {children}
        </span>
    );
}

function StatusBadge({ status }: { status: string | undefined }) {
    const s = (status ?? "").toLowerCase();

    if (s === "cancelled" || s === "void") {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-200">
                <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                ยกเลิกแล้ว
            </span>
        );
    }
    if (s === "refunded") {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
                คืนเงินแล้ว
            </span>
        );
    }
    if (s === "paid") {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                ชำระแล้ว
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            {status ?? "-"}
        </span>
    );
}

function ReceiptRow({
    name,
    variant,
    qty,
    price,
}: {
    name: string;
    variant: string | null;
    qty: number;
    price: number;
}) {
    const lineTotal = price * qty;

    return (
        <div className="flex items-start justify-between gap-4 py-3 px-2 rounded-lg hover:bg-white/5 transition">
            <div className="min-w-0">
                <div className="font-medium leading-tight truncate">{name}</div>
                {variant ? <div className="text-xs opacity-60 mt-1 truncate">{variant}</div> : null}
            </div>

            <div className="shrink-0 text-right tabular-nums">
                <div className="text-sm font-semibold">{fmtMoney(lineTotal)}</div>
                <div className="text-xs opacity-60 mt-0.5">
                    {qty} × {fmtMoney(price)}
                </div>
            </div>
        </div>
    );
}

function ModalShell({
    open,
    title,
    children,
    onClose,
}: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        if (open) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141210] shadow-2xl">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                        <div className="font-semibold">{title}</div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-text-secondary hover:bg-white/10 hover:text-text-primary transition"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="p-5">{children}</div>
                </div>
            </div>
        </div>
    );
}

function CancelStockToggle({
    value,
    disabled,
    onChange,
}: {
    value: boolean;
    disabled: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div>
            <div className="text-xs text-text-secondary opacity-70 mb-2">สต็อกหลังยกเลิก</div>

            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => onChange(true)}
                    disabled={disabled}
                    className={[
                        "rounded-xl border px-3 py-2 text-sm font-semibold transition text-left",
                        value
                            ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-100"
                            : "border-white/10 bg-white/5 text-text-secondary hover:bg-white/10",
                        disabled ? "opacity-70 cursor-not-allowed" : "",
                    ].join(" ")}
                >
                    ✅ คืนสต็อก
                    <div className="text-xs opacity-70 mt-0.5 font-normal">
                        ลูกค้ายกเลิก / กดผิด / ยังไม่ทำ
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => onChange(false)}
                    disabled={disabled}
                    className={[
                        "rounded-xl border px-3 py-2 text-sm font-semibold transition text-left",
                        !value
                            ? "border-amber-500/35 bg-amber-500/15 text-amber-100"
                            : "border-white/10 bg-white/5 text-text-secondary hover:bg-white/10",
                        disabled ? "opacity-70 cursor-not-allowed" : "",
                    ].join(" ")}
                >
                    🗑️ ไม่คืน (ของเสีย)
                    <div className="text-xs opacity-70 mt-0.5 font-normal">
                        ชงแล้ว / หก / ชงผิด / ทิ้งจริง
                    </div>
                </button>
            </div>
        </div>
    );
}

/* =========================
    Receipt Modal (reprinter)
========================= */
function paymentMethodLabel(method: string | undefined) {
    const m = (method ?? "").toLowerCase();
    if (m === "cash") return "เงินสด";
    if (m === "promptpay") return "PromptPay";
    return method ?? "-";
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

function buildReceiptDocument({
    order,
    mode,
    shopName,
    branchName,
    receiptSettings,
}: {
    order: UIOrderDetail;
    mode: "thermal" | "a4";
    shopName: string | null;
    branchName: string | null;
    receiptSettings: ReceiptSettings | null;
}) {
    // Admin reprints use current receipt settings for MVP; immutable snapshots are deferred.
    const effectiveShopName = receiptSettings?.shopName ?? shopName ?? "Coffee SaaS";
    const effectiveBranchName = receiptSettings?.branchName ?? branchName;
    const shopTitle = effectiveBranchName
        ? `${effectiveShopName} - ${effectiveBranchName}`
        : effectiveShopName;
    const branchAddressHtml = receiptSettings?.branchAddress
        ? `<div class="meta">${escapeReceiptHtml(receiptSettings.branchAddress)}</div>`
        : "";
    const branchPhoneHtml = receiptSettings?.branchPhone
        ? `<div class="meta">Tel / โทร: ${escapeReceiptHtml(receiptSettings.branchPhone)}</div>`
        : "";
    const taxIdHtml = receiptSettings?.taxId
        ? `<div class="meta">Tax ID / เลขผู้เสียภาษี: ${escapeReceiptHtml(receiptSettings.taxId)}</div>`
        : "";
    const footerHtml = receiptSettings?.receiptFooter
        ? `<div>${escapeReceiptHtml(receiptSettings.receiptFooter)}</div>`
        : `<div>ขอบคุณที่ใช้บริการ</div><div>Thank you</div>`;
    const receiptNumber = order.id.slice(-8) || "-";
    const paidDisplay = order.paid_amount != null ? `${fmtMoney(order.paid_amount)} บาท` : "-";
    const changeDisplay = order.change_amount != null ? `${fmtMoney(order.change_amount)} บาท` : "-";
    const isA4 = mode === "a4";
    const pageSize = isA4 ? "A4 portrait" : "90mm auto";
    const bodyWidth = "100%";
    const receiptWidth = isA4 ? "160mm" : "90mm";
    const receiptMargin = isA4 ? "16mm auto 0 auto" : "0 auto";
    const receiptPadding = isA4 ? "12mm" : "4mm";
    const baseFontSize = isA4 ? "14px" : "12px";
    const shopFontSize = isA4 ? "20px" : "14px";
    const headingFontSize = isA4 ? "16px" : "12px";
    const smallFontSize = isA4 ? "12px" : "10px";
    const dividerMargin = isA4 ? "12px 0" : "8px 0";
    const itemSpacing = isA4 ? "8px" : "5px";
    const summarySpacing = isA4 ? "6px" : "3px";

    const itemRows = order.items.map((item) => {
        const variant = cleanVariant(item.variant_label);
        const price = Number.isFinite(item.price) ? item.price : 0;
        const qty = Number.isFinite(item.qty) ? item.qty : 0;
        const variantHtml = variant ? `<div class="variant">${escapeReceiptHtml(variant)}</div>` : "";

        return `
            <div class="item-row">
                <div class="item-name">
                    <div>${escapeReceiptHtml(item.name)}</div>
                    ${variantHtml}
                </div>
                <div class="item-price">
                    <div>${fmtMoney(price * qty)}</div>
                    <div class="muted">${fmtMoney(qty)} × ${fmtMoney(price)}</div>
                </div>
            </div>
        `;
    }).join("");

    return `<!doctype html>
<html lang="th">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Receipt ${escapeReceiptHtml(receiptNumber)}</title>
        <style>
            @page { size: ${pageSize}; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff; color: #000; }
            body {
                width: ${bodyWidth};
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
                <div class="meta">${escapeReceiptHtml(order.id)}</div>
                <div class="meta">${escapeReceiptHtml(fmtDateTH(order.created_at))}</div>
            </header>
            <div class="divider"></div>
            <section>${itemRows}</section>
            <div class="divider"></div>
            <section class="summary">
                <div class="summary-row total"><span>ยอดรวม</span><span>${fmtMoney(order.total)} บาท</span></div>
                <div class="summary-row"><span>วิธีจ่าย</span><span>${escapeReceiptHtml(paymentMethodLabel(order.payment_method))}</span></div>
                <div class="summary-row"><span>รับเงิน</span><span>${paidDisplay}</span></div>
                <div class="summary-row"><span>เงินทอน</span><span>${changeDisplay}</span></div>
            </section>
            <footer class="thanks center">
                ${footerHtml}
            </footer>
        </main>
    </body>
</html>`;
}

function ReceiptModal({
    open,
    mode,
    onModeChange,
    onClose,
    order,
    shopName,
    branchName,
    receiptSettings,
}: {
    open: boolean;
    mode: "thermal" | "a4";
    onModeChange: (mode: "thermal" | "a4") => void;
    onClose: () => void;
    order: UIOrderDetail;
    shopName: string | null;
    branchName: string | null;
    receiptSettings: ReceiptSettings | null;
}) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [loadedReceiptDocument, setLoadedReceiptDocument] = useState<string | null>(null);
    const receiptSrcDoc = useMemo(
        () => buildReceiptDocument({ order, mode, shopName, branchName, receiptSettings }),
        [order, mode, shopName, branchName, receiptSettings]
    );
    const iframeLoaded = open && loadedReceiptDocument === receiptSrcDoc;

    const closeModal = useCallback(() => {
        setLoadedReceiptDocument(null);
        onClose();
    }, [onClose]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") closeModal();
        }
        if (open) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, closeModal]);

    const selectPrintMode = (nextMode: "thermal" | "a4") => {
        if (nextMode === mode) return;
        setLoadedReceiptDocument(null);
        onModeChange(nextMode);
    };

    const printReceipt = () => {
        if (!iframeLoaded) return;
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-[#141210] shadow-2xl">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                        <div className="font-semibold">ตัวอย่างใบเสร็จ</div>
                        <button
                            type="button"
                            onClick={closeModal}
                            className="rounded-lg p-2 text-text-secondary hover:bg-white/10 hover:text-text-primary transition"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 p-5">
                        {/* print mode selector (screen only) */}
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="text-xs text-text-secondary opacity-70">รูปแบบพิมพ์</div>
                            <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
                                <button
                                    type="button"
                                    onClick={() => selectPrintMode("thermal")}
                                    className={[
                                        "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                                        mode === "thermal"
                                            ? "bg-white/10 text-text-primary"
                                            : "text-text-secondary hover:text-text-primary",
                                    ].join(" ")}
                                >
                                    ใบเสร็จ 90mm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => selectPrintMode("a4")}
                                    className={[
                                        "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                                        mode === "a4"
                                            ? "bg-white/10 text-text-primary"
                                            : "text-text-secondary hover:text-text-primary",
                                    ].join(" ")}
                                >
                                    A4 / PDF
                                </button>
                            </div>
                        </div>

                        {/* The iframe document is both the preview and the print target. */}
                        <div className="max-h-[65vh] overflow-auto rounded-xl border border-white/10 bg-white/5 p-4">
                            <iframe
                                ref={iframeRef}
                                title="ตัวอย่างใบเสร็จ"
                                srcDoc={receiptSrcDoc}
                                onLoad={() => setLoadedReceiptDocument(receiptSrcDoc)}
                                className="mx-auto block border-0 bg-white"
                                style={{
                                    width: mode === "a4" ? "210mm" : "90mm",
                                    height: mode === "a4" ? "297mm" : "65vh",
                                }}
                            />
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-text-secondary hover:bg-white/10 transition"
                            >
                                ปิด
                            </button>
                            <button
                                type="button"
                                onClick={printReceipt}
                                disabled={!iframeLoaded}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Printer size={14} />
                                {iframeLoaded ? "พิมพ์ใบเสร็จ" : "กำลังเตรียมใบเสร็จ..."}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* =========================
    Page
========================= */
export default function OrderDetailPage() {
    const orderId = useOrderId();

    const [order, setOrder] = useState<UIOrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);

    // Cancel modal state
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelNote, setCancelNote] = useState("");
    const [cancelRestock, setCancelRestock] = useState(true);
    const [cancelConfirmStep, setCancelConfirmStep] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    // Receipt reprint state
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [receiptPrintMode, setReceiptPrintMode] = useState<"thermal" | "a4">("thermal");
    const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
    const [context, setContext] = useState<{
        shopName: string | null;
        branchName: string | null;
    }>({ shopName: null, branchName: null });

    const clearCopyTimer = useCallback(() => {
        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = null;
        }
    }, []);

    // Keep navbar names only as a fallback if receipt settings are unavailable.
    useEffect(() => {
        let alive = true;
        async function loadContext() {
            try {
                const res = await fetch("/api/admin/navbar", { cache: "no-store" });
                if (!res.ok) return;
                const data: unknown = await res.json().catch(() => null);
                if (!alive) return;
                setContext(parseNavbarReceiptContext(data));
            } catch {
                // ignore
            }
        }
        void loadContext();
        return () => { alive = false; };
    }, []);

    // Receipt settings are display-only and must never block order detail or printing.
    useEffect(() => {
        let alive = true;

        async function loadReceiptSettings() {
            try {
                const res = await fetch("/api/receipt-settings", { cache: "no-store" });
                if (!res.ok) return;

                const data: unknown = await res.json().catch(() => null);
                if (!alive) return;
                setReceiptSettings(parseReceiptSettings(data));
            } catch {
                // Silently retain the existing receipt fallback behavior.
            }
        }

        void loadReceiptSettings();
        return () => { alive = false; };
    }, []);

    const fetchOrder = useCallback(async (id: string, signal?: AbortSignal) => {
        const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`, { signal });
        const data: unknown = await res.json();
        const parsed = extractOrderFromResponse(data);
        return parsed;
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        async function run(id: string) {
            setLoading(true);
            setError(null);

            try {
                const parsed = await fetchOrder(id, controller.signal);
                setOrder(parsed);
                if (!parsed) setError("ไม่พบออเดอร์ / รูปแบบข้อมูลไม่ถูกต้อง");
            } catch (e: unknown) {
                if (controller.signal.aborted) return;
                setOrder(null);
                setError(e instanceof Error ? e.message : "โหลดข้อมูลออเดอร์ผิดพลาด");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        if (!orderId) {
            setLoading(false);
            setOrder(null);
            setError("ไม่มี Order ID");
            return () => controller.abort();
        }

        void run(orderId);
        return () => controller.abort();
    }, [orderId, fetchOrder]);

    useEffect(() => () => clearCopyTimer(), [clearCopyTimer]);

    const qtyTotal = useMemo(() => {
        if (!order) return 0;
        return order.items.reduce((sum, it) => sum + (Number.isFinite(it.qty) ? it.qty : 0), 0);
    }, [order]);

    const itemsCount = order?.items.length ?? 0;

    const onCopy = useCallback(
        async (id: string) => {
            try {
                await navigator.clipboard.writeText(id);
                setCopied(true);
                clearCopyTimer();
                copyTimerRef.current = window.setTimeout(() => setCopied(false), 900);
            } catch {
                // ignore
            }
        },
        [clearCopyTimer]
    );

    const isCancelled = useMemo(() => {
        const s = (order?.status ?? "").toLowerCase();
        return s === "cancelled" || s === "void";
    }, [order?.status]);

    const canCancel = useMemo(() => {
        const s = (order?.status ?? "").toLowerCase();
        return s === "paid";
    }, [order?.status]);

    const openCancelModal = useCallback(() => {
        setCancelOpen(true);
        setCancelNote("");
        setCancelRestock(true);
        setCancelConfirmStep(false);
        setCancelLoading(false);
        setCancelError(null);
    }, []);

    const closeCancelModal = useCallback(() => {
        if (cancelLoading) return;
        setCancelOpen(false);
    }, [cancelLoading]);

    const openReceipt = useCallback(() => {
        setReceiptPrintMode("thermal");
        setReceiptOpen(true);
    }, []);

    const closeReceipt = useCallback(() => setReceiptOpen(false), []);

    const submitCancel = useCallback(async () => {
        if (!order) return;

        const noteTrimmed = normalizeNote(cancelNote);

        // confirm step: 2-click confirm
        if (!cancelConfirmStep) {
            setCancelConfirmStep(true);
            setCancelError(null);
            return;
        }

        setCancelLoading(true);
        setCancelError(null);

        try {
            const body: {
                reason: CancelReason;
                cancelledBy: "staff";
                restock: boolean;
                cancelNote?: string;
            } = {
                reason: reasonFromRestock(cancelRestock),
                cancelledBy: "staff",
                restock: cancelRestock,
            };
            if (noteTrimmed) body.cancelNote = noteTrimmed;

            const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data: unknown = await res.json().catch(() => null);

            if (!res.ok) {
                const msg =
                    isRecord(data) && typeof data.error === "string"
                        ? data.error
                        : isRecord(data) && typeof data.detail === "string"
                            ? data.detail
                            : "ยกเลิกออเดอร์ไม่สำเร็จ";
                setCancelError(msg);
                setCancelLoading(false);
                return;
            }

            // API currently returns summary, so refresh
            const refreshed = await fetchOrder(order.id);
            setOrder(refreshed);

            setCancelLoading(false);
            setCancelOpen(false);
        } catch (e: unknown) {
            setCancelLoading(false);
            setCancelError(e instanceof Error ? e.message : "ยกเลิกออเดอร์ไม่สำเร็จ");
        }
    }, [order, cancelNote, cancelConfirmStep, cancelRestock, fetchOrder]);

    if (loading) {
        return (
            <div className="p-6 space-y-4 text-text-primary">
                <div className="h-5 w-44 rounded bg-white/5 animate-pulse" />
                <div className="h-40 rounded-2xl bg-white/5 animate-pulse" />
                <div className="h-80 rounded-2xl bg-white/5 animate-pulse" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 space-y-4 text-text-primary">
                <Link
                    href="/admin/orders"
                    className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition"
                >
                    <ArrowLeft size={18} />
                    กลับไปหน้า Orders
                </Link>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-text-secondary">
                    {error ?? "ไม่พบข้อมูลออเดอร์"}
                </div>
            </div>
        );
    }

    return (
        <div className="admin-order-detail-screen p-6 space-y-6 text-text-primary">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/admin/orders"
                    className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition"
                >
                    <ArrowLeft size={18} />
                    กลับไปหน้า Orders
                </Link>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onCopy(order.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-secondary hover:bg-white/10 transition"
                        title="คัดลอก Order ID"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span className="font-mono">{shortId(order.id)}</span>
                    </button>

                    <button
                        type="button"
                        onClick={openCancelModal}
                        disabled={!canCancel}
                        className={[
                            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition",
                            canCancel
                                ? "border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                                : "border border-white/10 bg-white/5 text-text-secondary opacity-60 cursor-not-allowed",
                        ].join(" ")}
                        title={canCancel ? "ยกเลิกออเดอร์" : "ยกเลิกได้เฉพาะออเดอร์ที่ชำระแล้ว (paid)"}
                    >
                        <AlertTriangle size={14} />
                        Cancel order
                    </button>

                    <button
                        type="button"
                        onClick={openReceipt}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-white/10 transition"
                        title="พิมพ์ใบเสร็จ"
                    >
                        <Printer size={14} />
                        พิมพ์ใบเสร็จ
                    </button>
                </div>
            </div>

            {/* Summary */}
            <Card title="สรุปออเดอร์">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs text-text-secondary opacity-70">{fmtDateTH(order.created_at)}</div>

                        <div className="mt-3 flex flex-wrap gap-2 items-center">
                            <StatusBadge status={order.status} />
                            <Pill>{itemsCount} รายการ</Pill>
                            <Pill>{qtyTotal} ชิ้น</Pill>
                            {order.payment_method ? <Pill>จ่าย: {order.payment_method}</Pill> : null}
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-xs text-text-secondary opacity-70">ยอดรวม</div>
                        <div className="text-3xl font-extrabold tabular-nums leading-tight">
                            {fmtMoney(order.total)}{" "}
                            <span className="text-base font-semibold opacity-80">บาท</span>
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <div className="text-xs text-text-secondary opacity-70">วิธีจ่าย</div>
                            <div className="font-semibold mt-1">
                                {order.payment_method === "cash"
                                    ? "เงินสด"
                                    : order.payment_method === "promptpay"
                                        ? "PromptPay"
                                        : order.payment_method ?? "-"}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-text-secondary opacity-70">สถานะ</div>
                            <div className="mt-1"><StatusBadge status={order.status} /></div>
                        </div>
                        <div>
                            <div className="text-xs text-text-secondary opacity-70">ยอดรวม</div>
                            <div className="font-semibold tabular-nums mt-1">{fmtMoney(order.total)} บาท</div>
                        </div>
                        <div>
                            <div className="text-xs text-text-secondary opacity-70">รับเงิน</div>
                            <div className="font-semibold tabular-nums mt-1">
                                {order.paid_amount != null ? `${fmtMoney(order.paid_amount)} บาท` : "-"}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-text-secondary opacity-70">เงินทอน</div>
                            <div className="font-semibold tabular-nums mt-1">
                                {order.change_amount != null ? `${fmtMoney(order.change_amount)} บาท` : "-"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cancel info */}
                {isCancelled ? (
                    <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
                        <div className="text-xs text-red-200/80">ยกเลิกแล้ว</div>
                        <div className="mt-1 text-sm">
                            <span className="font-semibold">เหตุผล:</span>{" "}
                            {order.cancel_reason ?? "—"}
                            {order.cancel_note ? (
                                <>
                                    {" "}
                                    <span className="opacity-70">|</span>{" "}
                                    <span className="opacity-90">{order.cancel_note}</span>
                                </>
                            ) : null}
                        </div>
                        {order.cancelled_at ? (
                            <div className="text-xs opacity-70 mt-1">
                                เวลา: {fmtDateTH(order.cancelled_at)}
                                {order.cancelled_by ? ` • โดย: ${order.cancelled_by}` : ""}
                            </div>
                        ) : null}

                        {typeof order.stock_refunded === "boolean" ? (
                            <div className="text-xs opacity-70 mt-2">
                                สต็อก: {order.stock_refunded ? "คืนแล้ว" : "ไม่คืน (ของเสีย)"}
                                {order.stock_refunded_at ? ` • เวลา: ${fmtDateTH(order.stock_refunded_at)}` : ""}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* Legacy note */}
                {!isCancelled && order.note ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-secondary opacity-70">หมายเหตุ</div>
                        <div className="text-sm mt-1">{order.note}</div>
                    </div>
                ) : null}
            </Card>

            {/* Items */}
            <Card title="รายการสินค้า">
                {order.items.length === 0 ? (
                    <div className="p-6 text-center text-text-secondary">ไม่มีสินค้าในออเดอร์นี้</div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {order.items.map((it) => (
                            <ReceiptRow
                                key={it.id}
                                name={it.name}
                                variant={cleanVariant(it.variant_label)}
                                qty={Number.isFinite(it.qty) ? it.qty : 0}
                                price={Number.isFinite(it.price) ? it.price : 0}
                            />
                        ))}
                    </div>
                )}

                {/* Bottom summary bar */}
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                    <div className="text-sm text-text-secondary">
                        รวม <span className="text-text-primary font-semibold">{qtyTotal}</span> ชิ้น
                    </div>
                    <div className="text-lg font-bold tabular-nums">{fmtMoney(order.total)} บาท</div>
                </div>
            </Card>

            {/* Cancel Modal */}
            <ModalShell open={cancelOpen} title="ยกเลิกออเดอร์" onClose={closeCancelModal}>
                <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-text-secondary opacity-70">Order</div>
                        <div className="mt-1 font-mono text-sm">{shortId(order.id, 10, 10)}</div>
                    </div>

                    {/* ✅ Removed: reason dropdown */}

                    <CancelStockToggle
                        value={cancelRestock}
                        disabled={cancelLoading}
                        onChange={(next) => {
                            setCancelRestock(next);
                            // changing restock option is a big deal -> re-arm confirm
                            setCancelConfirmStep(false);
                            setCancelError(null);
                        }}
                    />

                    <div>
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-text-secondary opacity-70 mb-1">หมายเหตุ (optional)</div>
                            <div className="text-xs text-text-secondary opacity-60">
                                {Math.min(200, normalizeNote(cancelNote).length)}/200
                            </div>
                        </div>
                        <textarea
                            value={cancelNote}
                            onChange={(e) => setCancelNote(e.target.value)}
                            disabled={cancelLoading}
                            rows={3}
                            className="w-full rounded-xl border border-white/10 bg-[#0f0d0b] px-3 py-2 text-sm outline-none focus:border-white/20"
                            placeholder="ใส่เพิ่มได้ (เช่น ลูกค้าขอแก้ไข, staff กดผิด)"
                        />
                    </div>

                    {cancelError ? (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
                            {cancelError}
                        </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={closeCancelModal}
                            disabled={cancelLoading}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary hover:bg-white/10 transition disabled:opacity-60"
                        >
                            ปิด
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setCancelConfirmStep(false);
                                setCancelError(null);
                                setCancelNote("");
                                setCancelRestock(true);
                            }}
                            disabled={cancelLoading}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary hover:bg-white/10 transition disabled:opacity-60"
                        >
                            รีเซ็ต
                        </button>

                        <button
                            type="button"
                            onClick={submitCancel}
                            disabled={cancelLoading || !canCancel}
                            className={[
                                "ml-auto rounded-xl px-4 py-2 text-sm font-semibold transition",
                                cancelLoading || !canCancel
                                    ? "border border-white/10 bg-white/5 text-text-secondary opacity-60 cursor-not-allowed"
                                    : cancelConfirmStep
                                        ? "border border-red-500/35 bg-red-500/20 text-red-100 hover:bg-red-500/25"
                                        : "border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15",
                            ].join(" ")}
                            title={!canCancel ? "ยกเลิกได้เฉพาะ status=paid" : ""}
                        >
                            {cancelLoading
                                ? "กำลังยกเลิก..."
                                : cancelConfirmStep
                                    ? "ยืนยันยกเลิก (กดอีกครั้ง)"
                                    : "ยกเลิกออเดอร์"}
                        </button>
                    </div>

                    <div className="text-xs text-text-secondary opacity-60">
                        * ยกเลิกแล้วออเดอร์จะไม่นับยอดขาย • สต็อกจะ{cancelRestock ? "คืน" : "ไม่คืน (ของเสีย)"}ตามที่เลือก
                    </div>
                </div>
            </ModalShell>

            <ReceiptModal
                open={receiptOpen}
                mode={receiptPrintMode}
                onModeChange={setReceiptPrintMode}
                onClose={closeReceipt}
                order={order}
                shopName={context.shopName}
                branchName={context.branchName}
                receiptSettings={receiptSettings}
            />
        </div>
    );
}
