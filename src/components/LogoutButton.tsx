"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({ className }: { className?: string }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    return <div className="inline-flex flex-col items-center gap-2">
        <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            setError(null);
            try {
                const response = await fetch("/api/auth/logout", { method: "POST" });
                const result = await response.json().catch(() => ({})) as { destination?: string; error?: string };
                if (!response.ok || !result.destination) {
                    setError(result.error ?? "ออกจากระบบไม่สำเร็จ");
                    return;
                }
                router.replace(result.destination);
                router.refresh();
            } catch {
                setError("ออกจากระบบไม่สำเร็จ");
            } finally {
                setBusy(false);
            }
        }} className={className ?? "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"}>
            {busy ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
        </button>
        {error ? <span role="alert" className="text-xs text-red-500">{error}</span> : null}
    </div>;
}
