// src/lib/dailyCloseMoney.ts
// Pure, unit-testable money helpers shared by server and client for Daily Close.

export function roundMoney(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return Math.round(safe * 100) / 100;
}

export type ExpectedCashInput = {
    openingCash: number;
    paidCashSales: number;
    cashIn: number;
    cashOut: number;
};

// Canonical expected-cash formula used everywhere:
//   expectedCash = openingCash + paidCashSales + cashIn - cashOut
// paidCashSales must come from paid cash-order totals (not paid_amount - change_amount).
export function computeExpectedCash(input: ExpectedCashInput): number {
    return roundMoney(
        roundMoney(input.openingCash) +
            roundMoney(input.paidCashSales) +
            roundMoney(input.cashIn) -
            roundMoney(input.cashOut)
    );
}
