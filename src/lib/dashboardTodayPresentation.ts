import type { DashboardTodayResponse } from "@/lib/dashboardToday";

export type DashboardActionGroup = {
    id: "out-of-stock" | "expired-lots" | "cash-variance" | "daily-close" | "low-stock" | "near-expiry";
    title: string;
    description: string;
    itemCount: number;
    examples: string[];
    href: string;
    linkLabel: string;
    tone: "critical" | "warning";
};

export type DashboardReviewGroup = {
    id: "orders" | "stock";
    title: string;
    description: string;
    itemCount: number;
    href: string;
    linkLabel: string;
};

export type DashboardTodayPresentation = {
    overview: {
        title: string;
        description: string;
        actionCount: number;
        primaryAction: { label: string; href: string } | null;
    };
    actions: DashboardActionGroup[];
    visibleActions: DashboardActionGroup[];
    hiddenActionCount: number;
    reviews: DashboardReviewGroup[];
    reviewCount: number;
    hasPaidSales: boolean;
};

const formatMoney = (value: number) =>
    `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

const uniqueNames = (names: string[]) => [...new Set(names.filter(Boolean))].slice(0, 3);

export function buildDashboardTodayPresentation(data: DashboardTodayResponse): DashboardTodayPresentation {
    const actions: DashboardActionGroup[] = [];
    const expiredLots = data.tasks.expiringLots.filter((lot) => lot.daysToExpiry < 0);
    const nearExpiryLots = data.tasks.expiringLots.filter((lot) => lot.daysToExpiry >= 0);
    if (data.tasks.outOfStock.length > 0) {
        actions.push({
            id: "out-of-stock",
            title: "ตรวจวัตถุดิบหมด",
            description: `วัตถุดิบคงเหลือ 0 หรือต่ำกว่า ${data.tasks.outOfStock.length} รายการ`,
            itemCount: data.tasks.outOfStock.length,
            examples: uniqueNames(data.tasks.outOfStock.map((item) => item.name)),
            href: "/admin/ingredients",
            linkLabel: "จัดการวัตถุดิบ",
            tone: "critical",
        });
    }
    if (expiredLots.length > 0) {
        actions.push({
            id: "expired-lots",
            title: "ตรวจล็อตหมดอายุแล้ว",
            description: `ล็อตที่เลยวันหมดอายุและยังมีจำนวนคงเหลือ ${expiredLots.length} รายการ`,
            itemCount: expiredLots.length,
            examples: uniqueNames(expiredLots.map((lot) => lot.ingredientName)),
            href: "/admin/ingredients",
            linkLabel: "ตรวจล็อตวัตถุดิบ",
            tone: "critical",
        });
    }

    const close = data.yesterdayClose;
    const isFinalClose = close?.status === "closed" || close?.status === "approved";
    const cashDifference = close?.cashDifference ?? null;
    if (isFinalClose && cashDifference != null && cashDifference !== 0) {
        const varianceType = cashDifference > 0 ? "เกิน" : "ขาด";
        actions.push({
            id: "cash-variance",
            title: `ตรวจเงินสด${varianceType}จากยอดระบบ`,
            description: `ปิดยอดแล้วและพบเงินสด${varianceType} ${formatMoney(Math.abs(cashDifference))}`,
            itemCount: 1,
            examples: [],
            href: "/admin/daily-close",
            linkLabel: "ตรวจการปิดยอด",
            tone: "critical",
        });
    }

    const needsClose = close?.status === "draft" || (!close && data.sales.paidOrderCount > 0);
    if (needsClose) {
        actions.push({
            id: "daily-close",
            title: "ปิดยอดเมื่อวานให้เสร็จ",
            description: close?.status === "draft"
                ? `รายการยังอยู่ในสถานะร่าง · ยอดขายที่ชำระแล้ว ${formatMoney(data.sales.netSales)}`
                : `มี ${data.sales.paidOrderCount.toLocaleString("th-TH")} ออเดอร์ที่ชำระแล้ว · ยอดขาย ${formatMoney(data.sales.netSales)}`,
            itemCount: 1,
            examples: [],
            href: "/admin/daily-close",
            linkLabel: "ไปปิดยอด",
            tone: "warning",
        });
    }

    if (data.tasks.lowStock.length > 0) {
        actions.push({
            id: "low-stock",
            title: "ตรวจวัตถุดิบใกล้หมด",
            description: `วัตถุดิบคงเหลือต่ำกว่าหรือเท่ากับขั้นต่ำ ${data.tasks.lowStock.length} รายการ`,
            itemCount: data.tasks.lowStock.length,
            examples: uniqueNames(data.tasks.lowStock.map((item) => item.name)),
            href: "/admin/ingredients",
            linkLabel: "ตรวจวัตถุดิบ",
            tone: "warning",
        });
    }
    if (nearExpiryLots.length > 0) {
        actions.push({
            id: "near-expiry",
            title: "ตรวจล็อตใกล้หมดอายุ",
            description: `ล็อตที่เข้าเกณฑ์แจ้งเตือนวันหมดอายุ ${nearExpiryLots.length} รายการ`,
            itemCount: nearExpiryLots.length,
            examples: uniqueNames(nearExpiryLots.map((lot) => lot.ingredientName)),
            href: "/admin/ingredients",
            linkLabel: "ตรวจล็อตวัตถุดิบ",
            tone: "warning",
        });
    }

    const reviews: DashboardReviewGroup[] = [];
    if (data.reviewEvents.orders.length > 0) {
        const statusCount = (status: string) => data.reviewEvents.orders.filter((order) => order.status === status).length;
        const descriptions = [
            ["ออเดอร์ยกเลิก", statusCount("cancelled") + statusCount("void")],
            ["คืนเงิน", statusCount("refunded")],
        ] as const;
        reviews.push({
            id: "orders",
            title: "ออเดอร์ที่สร้างเมื่อวานและควรตรวจ",
            description: descriptions.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count} รายการ`).join(" · "),
            itemCount: data.reviewEvents.orders.length,
            href: "/admin/orders",
            linkLabel: "ตรวจออเดอร์",
        });
    }
    if (data.reviewEvents.stock.length > 0) {
        const adjustments = data.reviewEvents.stock.filter((event) => event.type === "adjust").length;
        const waste = data.reviewEvents.stock.filter((event) => event.type === "waste").length;
        const descriptions = [adjustments ? `ปรับสต็อก ${adjustments} รายการ` : "", waste ? `ของเสีย ${waste} รายการ` : ""];
        reviews.push({
            id: "stock",
            title: "ความเคลื่อนไหวสต็อกเมื่อวาน",
            description: descriptions.filter(Boolean).join(" · "),
            itemCount: data.reviewEvents.stock.length,
            href: "/admin/stock",
            linkLabel: "ตรวจความเคลื่อนไหวสต็อก",
        });
    }

    const reviewCount = reviews.reduce((total, group) => total + group.itemCount, 0);
    const firstAction = actions[0];
    const firstReview = reviews[0];
    const overviewTitle = actions.length > 0
        ? `มี ${actions.length.toLocaleString("th-TH")} เรื่องต้องจัดการวันนี้`
        : reviewCount > 0
            ? `วันนี้ไม่มีเรื่องเร่งด่วน แต่มี ${reviewCount.toLocaleString("th-TH")} รายการที่ควรตรวจเพิ่มเติม`
            : "วันนี้ไม่มีเรื่องเร่งด่วน";
    const overviewDescription = actions.length > 0
        ? `จัดลำดับจากข้อมูลสต็อก การปิดยอด และยอดขายเมื่อวาน${reviewCount ? ` · มีอีก ${reviewCount.toLocaleString("th-TH")} รายการที่ควรตรวจ` : ""}`
        : reviewCount > 0
            ? "ไม่พบกลุ่มปัญหาที่ต้องจัดการทันที แต่มีข้อมูลจริงที่ควรตรวจเพิ่มเติม"
            : "ไม่พบปัญหาสต็อกหรือการปิดยอดที่เข้าเกณฑ์ และไม่มีรายการที่ควรตรวจเพิ่มเติม";

    return {
        overview: {
            title: overviewTitle,
            description: overviewDescription,
            actionCount: actions.length,
            primaryAction: firstAction
                ? { label: firstAction.linkLabel, href: firstAction.href }
                : firstReview
                    ? { label: "ตรวจรายการ", href: firstReview.href }
                    : null,
        },
        actions,
        visibleActions: actions.slice(0, 3),
        hiddenActionCount: Math.max(0, actions.length - 3),
        reviews,
        reviewCount,
        hasPaidSales: data.sales.paidOrderCount > 0,
    };
}
