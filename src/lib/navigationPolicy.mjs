import { parseAppRole } from "./accessPolicy.mjs";

export const NAV_SECTIONS = [
    { title: "ภาพรวม", items: [
        { label: "วันนี้", path: "/admin", roles: ["owner"] },
        { label: "รายงานยอดขาย", path: "/admin/reports", roles: ["owner"] },
    ] },
    { title: "เมนูและสต็อก", items: [
        { label: "เมนู", path: "/admin/menu", roles: ["owner"] },
        { label: "วัตถุดิบ", path: "/admin/ingredients", roles: ["owner", "staff"], children: [
            { label: "วัตถุดิบที่เก็บไว้", path: "/admin/ingredients/archived", roles: ["owner"] },
        ] },
        { label: "สูตรเมนู", path: "/admin/recipes", roles: ["owner"] },
        { label: "ความเคลื่อนไหวสต็อก", path: "/admin/stock", roles: ["owner", "staff"] },
    ] },
    { title: "งานประจำวัน", items: [
        { label: "ขายหน้าร้าน", path: "/pos", roles: ["owner", "staff"] },
        { label: "รายการขาย", path: "/admin/orders", roles: ["owner", "staff"] },
        { label: "ปิดยอดรายวัน", path: "/admin/daily-close", roles: ["owner", "staff"] },
        { label: "ข่าวสารหน้าเว็บ", path: "/admin/news", roles: ["owner"] },
        { label: "สาขา", path: "/admin/branch", roles: ["owner"] },
        { label: "ข้อความจากลูกค้า", path: "/admin/contact", roles: ["owner"] },
    ] },
];

export function navigationForRole(rawRole) {
    const role = parseAppRole(rawRole);
    if (!role) return [];
    if (role === "staff") {
        const order = ["/pos", "/admin/orders", "/admin/ingredients", "/admin/stock", "/admin/daily-close"];
        return [{
            title: "หน้างาน",
            items: NAV_SECTIONS.flatMap((section) => section.items)
                .filter((item) => order.includes(item.path))
                .sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path))
                .map((item) => ({ ...item, children: undefined })),
        }];
    }
    return NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items
            .filter((item) => item.roles.includes(role))
            .map((item) => ({
                ...item,
                children: item.children?.filter((child) => child.roles.includes(role)),
            })),
    })).filter((section) => section.items.length > 0);
}

export function isNavigationPathActive(pathname, itemPath) {
    if (itemPath === "/admin" || itemPath === "/pos") return pathname === itemPath;
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
