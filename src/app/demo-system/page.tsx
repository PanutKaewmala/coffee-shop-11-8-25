import type { Metadata } from "next";
import ProductExplorer from "./ProductExplorer";

export const metadata: Metadata = {
  title: "ดูหน้าจอจริงของ TALVO",
  description: "ลองดูหน้าจอที่ใช้จริงของ TALVO ตั้งแต่รับออเดอร์ ตั้งสูตร เช็กสต็อก ย้อนดูบิล ยกเลิกบิล ไปจนถึงปิดยอด",
};

export default function DemoSystemPage() {
  return (
    <main
      className="min-h-screen bg-background text-text-primary transition-colors duration-300"
      data-demo-system-page
    >
      <ProductExplorer />
    </main>
  );
}
