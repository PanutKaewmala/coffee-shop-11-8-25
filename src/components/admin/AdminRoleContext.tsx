"use client";

import { createContext, ReactNode, useContext } from "react";

type AdminRole = "owner" | "staff" | null;

const AdminRoleContext = createContext<AdminRole>(null);

export function AdminRoleProvider({
    role,
    children,
}: {
    role: AdminRole;
    children: ReactNode;
}) {
    return <AdminRoleContext.Provider value={role}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRole() {
    return useContext(AdminRoleContext);
}
