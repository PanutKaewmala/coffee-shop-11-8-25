export type ExpiryAlertTone = "danger" | "warning" | "normal" | "unknown";
export type ExpiryStatusLabel = "ปกติ" | "ใกล้หมดอายุ" | "หมดอายุแล้ว" | "ยังไม่มีข้อมูลวันหมดอายุ";

const DAY_MS = 24 * 60 * 60 * 1000;

function toBangkokDateKey(value: Date | string): string | null {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;

    return date.toLocaleDateString("sv-SE", {
        timeZone: "Asia/Bangkok",
    });
}

function dateKeyToDayNumber(dateKey: string): number | null {
    const time = Date.parse(`${dateKey}T00:00:00Z`);
    if (!Number.isFinite(time)) return null;
    return Math.floor(time / DAY_MS);
}

export function getDaysToExpiry(expiryAt: string | null | undefined, now = new Date()): number | null {
    if (!expiryAt) return null;

    const expiryKey = toBangkokDateKey(expiryAt);
    const todayKey = toBangkokDateKey(now);
    if (!expiryKey || !todayKey) return null;

    const expiryDay = dateKeyToDayNumber(expiryKey);
    const todayDay = dateKeyToDayNumber(todayKey);
    if (expiryDay == null || todayDay == null) return null;

    return expiryDay - todayDay;
}

export function getExpiryAlertTone(daysToExpiry: number | null): ExpiryAlertTone {
    if (daysToExpiry == null) return "unknown";
    if (daysToExpiry <= 1) return "danger";
    if (daysToExpiry <= 3) return "warning";
    return "normal";
}

export function getExpiryStatusLabel(daysToExpiry: number | null): ExpiryStatusLabel {
    if (daysToExpiry == null) return "ยังไม่มีข้อมูลวันหมดอายุ";
    if (daysToExpiry < 0) return "หมดอายุแล้ว";
    if (daysToExpiry <= 3) return "ใกล้หมดอายุ";
    return "ปกติ";
}
