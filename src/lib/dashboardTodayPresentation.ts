import type { DashboardTodayResponse } from "@/lib/dashboardToday";

export type DashboardActionGroup = {
    id: "out-of-stock" | "expired-lots" | "cash-variance" | "daily-close" | "low-stock" | "near-expiry" | "stock-unavailable";
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
    formattedYesterdayDate: string;
};

const formatMoney = (value: number) =>
    `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

const uniqueNames = (names: string[]) => [...new Set(names.filter(Boolean))].slice(0, 3);

function formatThaiDate(dateKey: string): string {
    const date = new Date(`${dateKey}T12:00:00+07:00`);
    if (!Number.isFinite(date.getTime())) return dateKey;
    return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date);
}

export function buildDashboardTodayPresentation(data: DashboardTodayResponse): DashboardTodayPresentation {
    const actions: DashboardActionGroup[] = [];
    const expiredLots = data.tasks.expiringLots.filter((lot) => lot.daysToExpiry < 0);
    const nearExpiryLots = data.tasks.expiringLots.filter((lot) => lot.daysToExpiry >= 0);
    if (data.tasks.outOfStock.length > 0) {
        actions.push({
            id: "out-of-stock",
            title: "วัตถุดิบหมด ต้องเติมของ",
            description: `มี ${data.tasks.outOfStock.length} รายการที่ของหมดหรือยอดต่ำกว่า 0`,
            itemCount: data.tasks.outOfStock.length,
            examples: uniqueNames(data.tasks.outOfStock.map((item) => item.name)),
            href: "/admin/stock/usable",
            linkLabel: "ดูสต็อกที่พร้อมใช้",
            tone: "critical",
        });
    }
    if (expiredLots.length > 0) {
        actions.push({
            id: "expired-lots",
            title: "มีล็อตหมดอายุที่ยังเหลืออยู่",
            description: `พบ ${expiredLots.length} รายการที่เลยวันหมดอายุแล้วแต่ยังมีของคงเหลือ`,
            itemCount: expiredLots.length,
            examples: uniqueNames(expiredLots.map((lot) => lot.ingredientName)),
            href: "/admin/ingredients",
            linkLabel: "ดูล็อตวัตถุดิบ",
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
            title: `เงินสด${varianceType}จากยอดที่ควรมี`,
            description: `หลังปิดยอด พบเงินสด${varianceType} ${formatMoney(Math.abs(cashDifference))}`,
            itemCount: 1,
            examples: [],
            href: "/admin/daily-close",
            linkLabel: "ดูรายละเอียดปิดยอด",
            tone: "critical",
        });
    }

    const needsClose = close?.status === "draft" || (!close && data.sales.paidOrderCount > 0);
    if (needsClose) {
        actions.push({
            id: "daily-close",
            title: "ปิดยอดเมื่อวานให้เสร็จ",
            description: close?.status === "draft"
                ? `เมื่อวานยังปิดยอดไม่เสร็จ · ยอดขายที่ชำระแล้ว ${formatMoney(data.sales.netSales)}`
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
            title: "วัตถุดิบใกล้หมด",
            description: `มี ${data.tasks.lowStock.length} รายการที่เหลือไม่เกินขั้นต่ำที่ตั้งไว้`,
            itemCount: data.tasks.lowStock.length,
            examples: uniqueNames(data.tasks.lowStock.map((item) => item.name)),
            href: "/admin/stock/usable",
            linkLabel: "ดูสต็อกที่พร้อมใช้",
            tone: "warning",
        });
    }
    if (nearExpiryLots.length > 0) {
        actions.push({
            id: "near-expiry",
            title: "มีล็อตใกล้หมดอายุ",
            description: `มี ${nearExpiryLots.length} รายการที่ใกล้ถึงวันหมดอายุ`,
            itemCount: nearExpiryLots.length,
            examples: uniqueNames(nearExpiryLots.map((lot) => lot.ingredientName)),
            href: "/admin/ingredients",
            linkLabel: "ดูล็อตวัตถุดิบ",
            tone: "warning",
        });
    }

    if (data.tasks.unavailableStock?.length) {
        actions.push({ id: "stock-unavailable", title: "มีวัตถุดิบบางรายการที่ยังคำนวณสต็อกไม่ได้",
            description: `มี ${data.tasks.unavailableStock.length} รายการที่ยังบอกยอดพร้อมใช้ไม่ได้ ต้องเช็กข้อมูลก่อน`,
            itemCount: data.tasks.unavailableStock.length, examples: uniqueNames(data.tasks.unavailableStock.map((item) => item.name)),
            href: "/admin/stock/usable", linkLabel: "ดูรายการที่ต้องเช็ก", tone: "warning" });
    }

    const reviews: DashboardReviewGroup[] = [];
    if (data.reviewEvents.orders.length > 0) {
        const statusCount = (status: string) => data.reviewEvents.orders.filter((order) => order.status === status).length;
        const descriptions = [
            ["บิลที่ยกเลิก", statusCount("cancelled") + statusCount("void")],
            ["คืนเงิน", statusCount("refunded")],
        ] as const;
        reviews.push({
            id: "orders",
            title: "บิลเมื่อวานที่ควรกลับไปเช็ก",
            description: descriptions.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count} รายการ`).join(" · "),
            itemCount: data.reviewEvents.orders.length,
            href: "/admin/orders",
            linkLabel: "ดูรายการขาย",
        });
    }
    if (data.reviewEvents.stock.length > 0) {
        const adjustments = data.reviewEvents.stock.filter((event) => event.type === "adjust").length;
        const waste = data.reviewEvents.stock.filter((event) => event.type === "waste").length;
        const descriptions = [adjustments ? `ปรับสต็อก ${adjustments} รายการ` : "", waste ? `ของเสีย ${waste} รายการ` : ""];
        reviews.push({
            id: "stock",
            title: "สต็อกที่มีการเปลี่ยนแปลงเมื่อวาน",
            description: descriptions.filter(Boolean).join(" · "),
            itemCount: data.reviewEvents.stock.length,
            href: "/admin/stock",
            linkLabel: "ดูความเคลื่อนไหวสต็อก",
        });
    }

    const reviewCount = reviews.reduce((total, group) => total + group.itemCount, 0);
    const firstAction = actions[0];
    const firstReview = reviews[0];
    const overviewTitle = actions.length > 0
        ? `วันนี้มี ${actions.length.toLocaleString("th-TH")} เรื่องที่ควรจัดการ`
        : reviewCount > 0
            ? `วันนี้ไม่มีเรื่องเร่งด่วน แต่มี ${reviewCount.toLocaleString("th-TH")} รายการที่น่ากลับไปเช็ก`
            : "วันนี้ไม่มีเรื่องเร่งด่วน";
    const overviewDescription = actions.length > 0
        ? `เรียงจากข้อมูลสต็อก การปิดยอด และยอดขายเมื่อวาน${reviewCount ? ` · ยังมีอีก ${reviewCount.toLocaleString("th-TH")} รายการที่ควรเช็ก` : ""}`
        : reviewCount > 0
            ? "ยังไม่มีเรื่องเร่งด่วน แต่มีบางรายการที่ควรกลับไปดูให้ชัวร์"
            : "ตอนนี้ยังไม่มีเรื่องที่ต้องจัดการหรือรายการที่ต้องเช็กเพิ่ม";

    const visibleActions = actions.filter((action, index) => index < 3 ||
        action.id === "out-of-stock" || action.id === "low-stock" || action.id === "stock-unavailable");

    return {
        overview: {
            title: overviewTitle,
            description: overviewDescription,
            actionCount: actions.length,
            primaryAction: firstAction
                ? { label: firstAction.linkLabel, href: firstAction.href }
                : firstReview
                    ? { label: "ดูรายการ", href: firstReview.href }
                    : null,
        },
        actions,
        visibleActions,
        hiddenActionCount: actions.length - visibleActions.length,
        reviews,
        reviewCount,
        hasPaidSales: data.sales.paidOrderCount > 0,
        formattedYesterdayDate: formatThaiDate(data.dates.yesterday.date),
    };
}
