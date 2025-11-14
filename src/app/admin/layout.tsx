"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminNavbar from "@/components/admin/AdminNavbar";
import Sidebar from "@/components/admin/Sidebar";
import { supabase } from "@/lib/supabaseClient";

interface AdminLayoutProps {
    children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
    const closeSidebar = () => setIsSidebarOpen(false);

    useEffect(() => {
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                router.replace("/login");
            } else {
                setLoading(false);
            }
        };

        checkSession();

        const { data: listener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (event === "SIGNED_OUT" || !session) {
                    router.replace("/login");
                }
            }
        );

        return () => {
            listener.subscription.unsubscribe();
        };
    }, [router]);

    if (loading)
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--background)] text-[var(--text-secondary)]">
                <div className="bg-[var(--surface)] border border-[var(--text-muted)]/20 px-6 py-4 rounded-xl shadow-sm text-[var(--text-primary)]">
                    <p className="animate-pulse">Loading dashboard...</p>
                </div>
            </div>
        );

    return (
        <div className="flex min-h-screen bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-300">
            {/* Sidebar */}
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

            {/* Main content area */}
            <div className="flex-1 flex flex-col relative z-10">
                <AdminNavbar onToggleSidebar={toggleSidebar} />

                <main className="flex-1 p-6 md:p-8 overflow-auto">
                    <div className="max-w-6xl mx-auto space-y-6">{children}</div>
                </main>
            </div>
        </div>
    );
}
