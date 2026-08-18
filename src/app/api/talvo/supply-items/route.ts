import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type ExpiryMode = "REQUIRED_USE_BY" | "NON_EXPIRING";

type CreateSupplyItemBody = {
    name: string;
    baseUnitId: string;
    quantityStep: string;
    isLotTracked: boolean;
    initialExpiryMode: ExpiryMode;
};

type CommandError = {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseIdempotencyKey(request: NextRequest): string | null {
    const value = request.headers.get("Idempotency-Key");
    if (!value || value !== value.trim()) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) return null;
    return value;
}

function normalizeQuantityStep(value: unknown): string | null {
    const candidate = typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : typeof value === "string"
            ? value
            : null;

    if (!candidate || candidate !== candidate.trim()) return null;
    if (!/^(0|[1-9][0-9]{0,11})([.][0-9]{1,6})?$/.test(candidate)) return null;

    const numericValue = Number(candidate);
    return Number.isFinite(numericValue) && numericValue > 0 ? candidate : null;
}

function parseBody(value: unknown): CreateSupplyItemBody | null {
    if (!isRecord(value)) return null;

    const name = typeof value.name === "string" ? value.name.trim() : "";
    const baseUnitId = typeof value.base_unit_id === "string" ? value.base_unit_id : "";
    const quantityStep = normalizeQuantityStep(value.quantity_step);
    const isLotTracked = value.is_lot_tracked;
    const initialExpiryMode = value.initial_expiry_mode;

    if (!name || name.length > 160) return null;
    if (!isUuid(baseUnitId)) return null;
    if (!quantityStep) return null;
    if (typeof isLotTracked !== "boolean") return null;
    if (initialExpiryMode !== "REQUIRED_USE_BY" && initialExpiryMode !== "NON_EXPIRING") return null;
    if (!isLotTracked && initialExpiryMode !== "NON_EXPIRING") return null;

    return {
        name,
        baseUnitId,
        quantityStep,
        isLotTracked,
        initialExpiryMode,
    };
}

function isCommandError(value: unknown): value is CommandError {
    return isRecord(value)
        && value.ok === false
        && isRecord(value.error)
        && typeof value.error.code === "string"
        && typeof value.error.message === "string";
}

function statusForCommandError(code: string): number {
    switch (code) {
        case "VALIDATION_FAILED":
            return 400;
        case "FORBIDDEN":
            return 403;
        case "NOT_FOUND":
            return 404;
        case "IDEMPOTENCY_CONFLICT":
        case "COMMAND_IN_PROGRESS":
        case "INVALID_STATE":
            return 409;
        default:
            return 500;
    }
}

export async function POST(request: NextRequest) {
    const idempotencyKey = parseIdempotencyKey(request);
    if (!idempotencyKey) {
        return NextResponse.json(
            { ok: false, error: { code: "VALIDATION_FAILED", message: "A valid Idempotency-Key header is required" } },
            { status: 400 },
        );
    }

    let rawBody: unknown;
    try {
        rawBody = await request.json();
    } catch {
        return NextResponse.json(
            { ok: false, error: { code: "VALIDATION_FAILED", message: "Request body must be valid JSON" } },
            { status: 400 },
        );
    }

    const body = parseBody(rawBody);
    if (!body) {
        return NextResponse.json(
            { ok: false, error: { code: "VALIDATION_FAILED", message: "CreateSupplyItem payload is invalid" } },
            { status: 400 },
        );
    }

    const supabase = await getSupabaseServer();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
        return NextResponse.json(
            { ok: false, error: { code: "AUTHENTICATION_FAILED", message: "Unable to verify the current session" } },
            { status: 500 },
        );
    }
    if (!auth.user) {
        return NextResponse.json(
            { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication is required" } },
            { status: 401 },
        );
    }

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json(
            { ok: false, error: { code: "CONTEXT_REQUIRED", message: "Select a shop before creating a supply item" } },
            { status: 409 },
        );
    }

    const { data, error } = await supabase.rpc("create_talvo_supply_item", {
        p_business_id: currentShopId,
        p_name: body.name,
        p_base_unit_id: body.baseUnitId,
        p_quantity_step: body.quantityStep as unknown as number,
        p_is_lot_tracked: body.isLotTracked,
        p_initial_expiry_mode: body.initialExpiryMode,
        p_idempotency_key: idempotencyKey,
    });

    if (error) {
        console.error("CreateSupplyItem RPC failed", { code: error.code });
        return NextResponse.json(
            { ok: false, error: { code: "DATABASE_COMMAND_FAILED", message: "CreateSupplyItem could not be completed" } },
            { status: 500 },
        );
    }

    const result: Json = data;
    if (isCommandError(result)) {
        return NextResponse.json(result, { status: statusForCommandError(result.error.code) });
    }
    if (!isRecord(result) || result.ok !== true || !isRecord(result.data)) {
        return NextResponse.json(
            { ok: false, error: { code: "INVALID_COMMAND_RESULT", message: "CreateSupplyItem returned an invalid result" } },
            { status: 500 },
        );
    }

    return NextResponse.json(result, { status: 201 });
}
