export function parseDailyCloseRole(value) {
    return value === "owner" || value === "staff" ? value : null;
}

export function cashDifferenceRequiresReason(value) {
    const amount = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(amount)) return false;
    return Math.round(amount * 100) / 100 !== 0;
}
