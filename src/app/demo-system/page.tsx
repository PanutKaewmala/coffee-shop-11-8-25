import type { Metadata } from "next";
import ProductExplorer from "./ProductExplorer";

export const metadata: Metadata = {
  title: "ดูหน้าจอจริงของ TALVO",
  description: "สำรวจหน้าจอจริงของ TALVO ทีละงาน ตั้งแต่ขายหน้าร้าน สูตรเมนู สต็อก ออเดอร์ การยกเลิก จนถึงปิดยอดรายวัน",
};

export default function DemoSystemPage() {
  return (
    <main
      className="min-h-screen bg-[#fbf8f4] text-[#30261f] transition-colors duration-300 dark:bg-[#0f0d0c] dark:text-[#f5f3f0]"
      data-demo-system-page
    >
      <ProductExplorer />
    </main>
  );
}
