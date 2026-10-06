export function normalizeFirstShopInput(value = {}) {
    const shopName = typeof value.shop_name === "string" ? value.shop_name.trim() : "";
    const branchName = typeof value.branch_name === "string" ? value.branch_name.trim() : "";
    const address = typeof value.address === "string" ? value.address.trim() : "";
    const phone = typeof value.phone === "string" ? value.phone.trim() : "";

    return { shopName, branchName, address, phone };
}

export function firstShopInputError(input) {
    if (!input.shopName) return "กรุณาใส่ชื่อร้าน";
    if (input.shopName.length > 120) return "ชื่อร้านยาวเกินไป";
    if (!input.branchName) return "กรุณาใส่ชื่อสาขา";
    if (input.branchName.length > 120) return "ชื่อสาขายาวเกินไป";
    if (!input.address) return "กรุณาใส่ที่อยู่ร้าน";
    if (input.address.length > 300) return "ที่อยู่ร้านยาวเกินไป";
    if (input.phone.length > 50) return "เบอร์โทรยาวเกินไป";
    return null;
}

export function firstShopSlugBase(name) {
    if (typeof name !== "string") return "shop";
    const ascii = name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return ascii || "shop";
}
