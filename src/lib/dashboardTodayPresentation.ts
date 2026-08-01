import type { DashboardTodayResponse } from "@/lib/dashboardToday";

export type DashboardTodayAction = {
    id: "critical-stock" | "cash-variance" | "daily-close" | "stock-warning";
    title: string;
    description: string;
    href: string;
    label: string;
    priority: number;
    tone: "danger" | "warning";
};

export type DashboardTodayEventGroup = {
    id: "orders" | "stock" | "cash";
    title: string;
    description: string;
    href: string;
    count: number;
};

export type DashboardTodayPresentation = {
    overview: {
        tone: "danger" | "warning" | "neutral" | "success";
        title: string;
        description: string;
        primaryAction: null | { label: string; href: string };
    };
    actions: DashboardTodayAction[];
    visibleActions: DashboardTodayAction[];
    hiddenActionCount: number;
    nextHiddenAction: DashboardTodayAction | null;
    reviewGroups: DashboardTodayEventGroup[];
    reviewCount: number;
    hasSales: boolean;
};

const money = (value: number) =>
    `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿`;

const uniqueNames = (names: string[]) => [...new Set(names.filter(Boolean))];

function sampleText(names: string[]) {
    const samples = uniqueNames(names).slice(0, 2);
    return samples.length > 0 ? ` · เช่น ${samples.join(", ")}` : "";
}

export function buildDashboardTodayPresentation(
    data: DashboardTodayResponse,
): DashboardTodayPresentation {
    const close = data.yesterdayClose;
    const expiredLots = data.tasks.expiringLots.filter((item) => item.daysToExpiry < 0);
    const nearExpiryLots = data.tasks.expiringLots.filter((item) => item.daysToExpiry >= 0);
    const actions: DashboardTodayAction[] = [];

    if (data.tasks.outOfStock.length > 0 || expiredLots.length > 0) {
        const parts: string[] = [];
        if (data.tasks.outOfStock.length > 0) {
            parts.push(`วัตถุดิบหมด ${data.tasks.outOfStock.length} รายการ`);
        }
        if (expiredLots.length > 0) {
            parts.push(`ล็อตหมดอายุ ${expiredLots.length} ล็อต`);
        }
        const names = [
            ...data.tasks.outOfStock.map((item) => item.name),
            ...expiredLots.map((item) => item.ingredientName),
        ];
        const ingredientId = data.tasks.outOfStock[0]?.id ?? expiredLots[0]!.ingredientId;

        actions.push({
            id: "critical-stock",
            title:
                data.tasks.outOfStock.length > 0 && expiredLots.length > 0
                    ? "มีสต๊อกเร่งด่วนที่ต้องจัดการ"
                    : data.tasks.outOfStock.length > 0
                      ? "มีวัตถุดิบหมด"
                      : "มีล็อตหมดอายุ",
            description: `${parts.join(" · ")}${sampleText(names)}`,
            href: `/admin/ingredients/${ingredientId}`,
            label: "จัดการสต๊อก",
            priority: 10,
            tone: "danger",
        });
    }

    const closeIsFinal = close?.status === "closed" || close?.status === "approved";
    if (close && closeIsFinal && close.cashDifference != null && close.cashDifference !== 0) {
        actions.push({
            id: "cash-variance",
            title: close.cashDifference > 0 ? "เงินสดเกินจากการปิดยอด" : "เงินสดขาดจากการปิดยอด",
            description: `ต่างจากยอดตามระบบ ${money(Math.abs(close.cashDifference))}`,
            href: "/admin/daily-close",
            label: "ตรวจปิดยอด",
            priority: 20,
            tone: "danger",
        });
    }

    if (close?.status === "draft" || (!close && data.sales.paidOrderCount > 0)) {
        actions.push({
            id: "daily-close",
            title: "ปิดยอดเมื่อวานให้เสร็จ",
            description:
                close?.status === "draft"
                    ? `ยอดวันที่ ${data.dates.yesterday.date} ยังอยู่ในสถานะร่าง`
                    : `เมื่อวานมี ${data.sales.paidOrderCount.toLocaleString("th-TH")} ออเดอร์ ยอดขาย ${money(data.sales.netSales)} แต่ยังไม่พบการปิดยอด`,
            href: "/admin/daily-close",
            label: "ไปปิดยอด",
            priority: 30,
            tone: "warning",
        });
    }

    if (data.tasks.lowStock.length > 0 || nearExpiryLots.length > 0) {
        const parts: string[] = [];
        if (data.tasks.lowStock.length > 0) {
            parts.push(`วัตถุดิบต่ำกว่าขั้นต่ำ ${data.tasks.lowStock.length} รายการ`);
        }
        if (nearExpiryLots.length > 0) {
            parts.push(`ล็อตใกล้หมดอายุ ${nearExpiryLots.length} ล็อต`);
        }
        const names = [
            ...data.tasks.lowStock.map((item) => item.name),
            ...nearExpiryLots.map((item) => item.ingredientName),
        ];
        const ingredientId = data.tasks.lowStock[0]?.id ?? nearExpiryLots[0]!.ingredientId;

        actions.push({
            id: "stock-warning",
            title:
                data.tasks.lowStock.length > 0 && nearExpiryLots.length > 0
                    ? "มีสต๊อกที่ควรเตรียมวันนี้"
                    : data.tasks.lowStock.length > 0
                      ? "มีวัตถุดิบต่ำกว่าขั้นต่ำ"
                      : "มีล็อตใกล้หมดอายุ",
            description: `${parts.join(" · ")}${sampleText(names)}`,
            href: `/admin/ingredients/${ingredientId}`,
            label: "ดูวัตถุดิบ",
            priority: 40,
            tone: "warning",
        });
    }

    actions.sort((a, b) => a.priority - b.priority);

    const reviewGroups: DashboardTodayEventGroup[] = [];
    if (data.reviewEvents.orders.length > 0) {
        const cancelledCount = data.reviewEvents.orders.filter(
            (order) => order.status === "cancelled" || order.status === "void",
        ).length;
        const refundedCount = data.reviewEvents.orders.filter(
            (order) => order.status === "refunded",
        ).length;
        const parts: string[] = [];
        if (cancelledCount > 0) parts.push(`ออเดอร์ยกเลิก ${cancelledCount} รายการ`);
        if (refundedCount > 0) parts.push(`คืนเงิน ${refundedCount} รายการ`);

        reviewGroups.push({
            id: "orders",
            title: "ออเดอร์ของเมื่อวานที่ควรตรวจ",
            description: parts.join(" · "),
            href: "/admin/orders",
            count: data.reviewEvents.orders.length,
        });
    }

    if (data.reviewEvents.stock.length > 0) {
        const adjustCount = data.reviewEvents.stock.filter((event) => event.type === "adjust").length;
        const wasteCount = data.reviewEvents.stock.filter((event) => event.type === "waste").length;
        const parts: string[] = [];
        if (adjustCount > 0) parts.push(`ปรับสต๊อก ${adjustCount} รายการ`);
        if (wasteCount > 0) parts.push(`ของเสีย ${wasteCount} รายการ`);

        reviewGroups.push({
            id: "stock",
            title: "การเคลื่อนไหวสต๊อกเมื่อวาน",
            description: parts.join(" · "),
            href: "/admin/stock",
            count: data.reviewEvents.stock.length,
        });
    }

    const reviewCashDifference = closeIsFinal ? data.reviewEvents.cashDifference : null;
    if (reviewCashDifference != null && reviewCashDifference !== 0) {
        reviewGroups.push({
            id: "cash",
            title: reviewCashDifference > 0 ? "เงินสดเกินจากยอดตามระบบ" : "เงินสดขาดจากยอดตามระบบ",
            description: `${reviewCashDifference > 0 ? "เกิน" : "ขาด"} ${money(Math.abs(reviewCashDifference))}`,
            href: "/admin/daily-close",
            count: 1,
        });
    }

    const reviewCount = reviewGroups.reduce((total, group) => total + group.count, 0);
    const firstAction = actions[0] ?? null;
    const firstReview = reviewGroups[0] ?? null;
    const overview = firstAction
        ? {
              tone: actions.some((action) => action.tone === "danger") ? ("danger" as const) : ("warning" as const),
              title: `มี ${actions.length} เรื่องต้องจัดการวันนี้`,
              description: firstAction.description,
              primaryAction: { label: firstAction.label, href: firstAction.href },
          }
        : firstReview
          ? {
                tone: "neutral" as const,
                title: "วันนี้ไม่มีเรื่องเร่งด่วน",
                description: `มี ${reviewCount.toLocaleString("th-TH")} เหตุการณ์จากเมื่อวานที่ควรตรวจ`,
                primaryAction: { label: "ตรวจเหตุการณ์", href: firstReview.href },
            }
          : {
                tone: "success" as const,
                title: "วันนี้ไม่มีเรื่องเร่งด่วน",
                description:
                    data.sales.paidOrderCount === 0
                        ? "เมื่อวานไม่มีรายการขาย และไม่พบเหตุการณ์ที่ต้องตรวจ"
                        : closeIsFinal && close?.cashDifference === 0
                          ? "เมื่อวานปิดยอดแล้ว เงินสดตรง และไม่พบเรื่องที่ต้องจัดการ"
                          : "ไม่พบรายการที่ต้องจัดการจากข้อมูลปัจจุบัน",
                primaryAction: null,
            };

    return {
        overview,
        actions,
        visibleActions: actions.slice(0, 3),
        hiddenActionCount: Math.max(actions.length - 3, 0),
        nextHiddenAction: actions[3] ?? null,
        reviewGroups,
        reviewCount,
        hasSales: data.sales.paidOrderCount > 0,
    };
}
