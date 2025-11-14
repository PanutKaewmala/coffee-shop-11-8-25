"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ClientWrapper({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    // ซ่อน Navbar / Footer ในหน้า admin และ login
    const hideNavAndFooter =
        pathname.startsWith("/admin") || pathname.startsWith("/login");

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground transition-colors duration-300">
            {!hideNavAndFooter && <Navbar />}
            <main className="flex-1">{children}</main>
            {!hideNavAndFooter && <Footer />}
        </div>
    );
}
    