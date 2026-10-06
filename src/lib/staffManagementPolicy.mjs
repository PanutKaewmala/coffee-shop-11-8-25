export function normalizeStaffEmail(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
}

export function staffAccountInputError({ name, email, password }) {
    if (typeof name !== "string" || !name.trim()) return "กรุณาใส่ชื่อพนักงาน";
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "กรุณาใส่อีเมลให้ถูกต้อง";
    }
    if (typeof password !== "string" || password.length < 8) {
        return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    }
    return null;
}
