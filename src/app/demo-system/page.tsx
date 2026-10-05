import type { Metadata } from "next";
import ProductExplorer from "./ProductExplorer";

export const metadata: Metadata = {
  title: "TALVO Product Explorer",
  description: "สำรวจหน้าจอจริงของ TALVO ทีละงาน ตั้งแต่ POS สูตรเมนู สต็อก ออเดอร์ การยกเลิก จนถึง Daily Close",
};

export default function DemoSystemPage() {
  return (
    <main className="min-h-screen bg-[#12100e] text-[#f5f3f0]" data-demo-system-page>
      <ProductExplorer />
    </main>
  );
}
