import { parseAppRole } from "./accessPolicy.mjs";

export const NAV_SECTIONS = [
    { title: "ภาพรวม", items: [
        { label: "ภาพรวมวันนี้", path: "/admin", roles: ["owner"] },
        { label: "รายงาน", path: "/admin/reports", roles: ["owner"] },
    ] },
    { title: "จัดการสินค้า", items: [
        { label: "เมนู", path: "/admin/menu", roles: ["owner"] },
        { label: "วัตถุดิบ", path: "/admin/ingredients", roles: ["owner", "staff"], children: [
            { label: "คลังเก่า", path: "/admin/ingredients/archived", roles: ["owner"] },
        ] },
        { label: "สูตรเมนู", path: "/admin/recipes", roles: ["owner"] },
        { label: "ประวัติสต็อก", path: "/admin/stock", roles: ["owner", "staff"] },
    ] },
    { title: "การดำเนินธุรกิจ", items: [
        { label: "ขายหน้าร้าน", path: "/pos", roles: ["owner", "staff"] },
        { label: "ออเดอร์", path: "/admin/orders", roles: ["owner", "staff"] },
        { label: "ปิดยอดวัน", path: "/admin/daily-close", roles: ["owner", "staff"] },
        { label: "ข่าวสาร", path: "/admin/news", roles: ["owner"] },
        { label: "สาขา", path: "/admin/branch", roles: ["owner"] },
        { label: "ติดต่อ", path: "/admin/contact", roles: ["owner"] },
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
