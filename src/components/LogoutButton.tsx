"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({ className }: { className?: string }) {
    const router = useRouter();
    return <button type="button" onClick={async () => {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        const result = response.ok ? await response.json() as { destination?: string } : {};
        router.replace(result.destination ?? "/login");
        router.refresh();
    }} className={className ?? "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"}>
        ออกจากระบบ
    </button>;
}
