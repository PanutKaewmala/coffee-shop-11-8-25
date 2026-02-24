import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type BranchMenuAvailabilityRow = {
    branch_id: string;
    menu_id: string;
    shop_id: string | null;
    is_enabled: boolean;
};

type BranchMenuAvailabilityInsert = {
    branch_id: string;
    menu_id: string;
    shop_id?: string | null;
    is_enabled?: boolean;
};

type DatabaseWithBranchMenu = {
    public: {
        Tables: Database["public"]["Tables"] & {
            branch_menu_availability: {
                Row: BranchMenuAvailabilityRow;
                Insert: BranchMenuAvailabilityInsert;
                Update: Partial<BranchMenuAvailabilityInsert>;
                Relationships: [];
            };
        };
        Views: Database["public"]["Views"];
        Functions: Database["public"]["Functions"];
        Enums: Database["public"]["Enums"];
        CompositeTypes: Database["public"]["CompositeTypes"];
    };
};

function asBranchMenuClient(
    client: SupabaseClient<Database>
): SupabaseClient<DatabaseWithBranchMenu> {
    return client as unknown as SupabaseClient<DatabaseWithBranchMenu>;
}

function uniqueIds(ids: string[]): string[] {
    return Array.from(new Set(ids.filter(Boolean)));
}

export function isMenuEnabledInBranch(
    menuId: string,
    availabilityMap: ReadonlyMap<string, boolean>
): boolean {
    // Default-closed model:
    // menu is sellable in a branch only when an explicit row exists and is_enabled = true.
    return availabilityMap.get(menuId) === true;
}

export async function loadBranchMenuAvailabilityMap(params: {
    client: SupabaseClient<Database>;
    branchId: string | null;
    menuIds: string[];
}): Promise<Map<string, boolean>> {
    const { client, branchId } = params;
    const menuIds = uniqueIds(params.menuIds);
    const map = new Map<string, boolean>();

    if (!branchId || menuIds.length === 0) return map;

    const db = asBranchMenuClient(client);
    const { data, error } = await db
        .from("branch_menu_availability")
        .select("menu_id,is_enabled")
        .eq("branch_id", branchId)
        .in("menu_id", menuIds);

    if (error) {
        throw new Error(error.message);
    }

    for (const row of data ?? []) {
        map.set(row.menu_id, Boolean(row.is_enabled));
    }

    return map;
}

export async function upsertBranchMenuAvailability(params: {
    client: SupabaseClient<Database>;
    branchId: string;
    menuId: string;
    shopId: string;
    isEnabled: boolean;
}): Promise<void> {
    const db = asBranchMenuClient(params.client);

    const { error } = await db.from("branch_menu_availability").upsert(
        [
            {
                branch_id: params.branchId,
                menu_id: params.menuId,
                shop_id: params.shopId,
                is_enabled: params.isEnabled,
            },
        ],
        { onConflict: "branch_id,menu_id" }
    );

    if (error) {
        throw new Error(error.message);
    }
}
