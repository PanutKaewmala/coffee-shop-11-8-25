import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ดูตัวอย่างระบบ | Coffee SaaS",
  description: "ดูภาพรวมระบบหลังบ้านสำหรับร้านกาแฟ: ขายหน้าร้าน ออเดอร์ ใบเสร็จ สูตร สต็อก และปิดยอดรายวัน",
};

const highlights = [
  "ขายหน้าร้านและออกออเดอร์",
  "ดูประวัติยอดขายและใบเสร็จ",
  "ผูกสูตรเมนูกับสต็อก",
  "ปิดยอดรายวันและล็อกข้อมูลหลังปิดยอด",
];

const screenshots = [
  {
    title: "ขายหน้าร้าน",
    eyebrow: "ระบบขายหน้าร้าน",
    description: "เลือกเมนู เพิ่มลงตะกร้า รับชำระเงิน และสร้างออเดอร์จากหน้าเดียว",
    src: "/demo-system/pos.png",
    width: 1917,
    height: 1049,
  },
  {
    title: "ดูรายการออเดอร์",
    eyebrow: "ออเดอร์และยอดขาย",
    description: "ดูสถานะ วิธีชำระเงิน รายการสินค้า ยอดรวม และเวลาที่ขายได้ย้อนหลัง",
    src: "/demo-system/orders.png",
    width: 1919,
    height: 1037,
  },
  {
    title: "ออกใบเสร็จ",
    eyebrow: "ใบเสร็จ",
    description: "เปิดดูใบเสร็จหลังขาย และใช้เป็นหลักฐานให้ลูกค้าหรือหลังบ้านได้",
    src: "/demo-system/receipt.png",
    width: 1917,
    height: 1033,
  },
  {
    title: "ตั้งสูตรเมนู",
    eyebrow: "สูตรเมนู",
    description: "ผูกเมนูกับวัตถุดิบ เพื่อให้ระบบรู้ว่าขายหนึ่งแก้วต้องใช้ของอะไรบ้าง",
    src: "/demo-system/recipes.png",
    width: 1919,
    height: 1039,
  },
  {
    title: "ดูสต็อกวัตถุดิบ",
    eyebrow: "สต็อก",
    description: "ดูของเข้า-ออกและประวัติสต็อก เพื่อรู้ว่าวัตถุดิบไหนควรเติมก่อนของหมด",
    src: "/demo-system/stock.png",
    width: 1909,
    height: 1032,
  },
  {
    title: "ปิดยอดรายวัน",
    eyebrow: "สรุปท้ายวัน",
    description: "สรุปยอดขาย เงินสด พร้อมเพย์ และรายการที่ควรตรวจตอนปิดร้าน",
    src: "/demo-system/daily-close.png",
    width: 1919,
    height: 1039,
  },
  {
    title: "ล็อกข้อมูลหลังปิดยอด",
    eyebrow: "ลดการแก้ย้อนหลัง",
    description: "หลังปิดยอดแล้ว ระบบช่วยล็อกข้อมูลสำคัญ เพื่อลดการแก้ย้อนหลังและกันยอดเพี้ยน",
    src: "/demo-system/locked-close.png",
    width: 1919,
    height: 1049,
  },
] as const;

export default function DemoSystemPage() {
  return (
    <main className="min-h-screen bg-[#12100e] text-[#f5f3f0]" data-demo-system-page>
      <style>{`
        header.sticky {
          position: static;
          top: auto;
        }
      `}</style>

      <section className="relative isolate min-h-[82svh] overflow-hidden px-4 py-16 sm:py-20 lg:min-h-[76svh]">
        <Image
          src="/demo-system/pos.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-left-top opacity-35"
        />
        <div className="absolute inset-0 -z-10 bg-[#12100e]/78" />

        <div className="mx-auto flex min-h-[58svh] max-w-6xl flex-col justify-center">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-[#d4a574]/35 bg-[#d4a574]/12 px-4 py-2 text-sm font-medium text-[#d4a574]">
              ตัวอย่างระบบสำหรับร้านกาแฟ / ร้านเครื่องดื่ม
            </div>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              ดูตัวอย่างระบบหลังบ้านก่อนเริ่มทดลอง
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d6cbbf] sm:text-lg">
              รวมภาพหน้าจอหลักของระบบ ตั้งแต่ขายหน้าร้าน ดูออเดอร์ ออกใบเสร็จ ตั้งสูตร หักสต็อก
              ไปจนถึงปิดยอดรายวัน เหมาะสำหรับดูภาพรวมก่อนคุย flow ร้าน
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="#screens"
                className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#d4a574] to-[#b38455] px-6 py-3 font-semibold text-white transition hover:brightness-110 sm:w-auto"
              >
                ดูตัวอย่างระบบ
              </Link>
              <Link
                href="/#contact"
                className="inline-flex w-full items-center justify-center rounded-full border border-[#d4a574]/35 bg-[#1b1917]/80 px-6 py-3 font-semibold text-[#d6cbbf] transition hover:bg-[#23201d] sm:w-auto"
              >
                คุย flow ร้านก่อน
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#1b1917] px-4 py-8">
        <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#d6cbbf]">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="screens" className="scroll-mt-36 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold">ภาพตัวอย่างแต่ละส่วนของระบบ</h2>
            <p className="mt-3 leading-7 text-[#d6cbbf]">
              ไล่ดูจากงานขายหน้าร้านไปถึงงานหลังบ้าน เพื่อเห็นว่าระบบช่วยจัดระเบียบข้อมูลร้านเล็กได้อย่างไร
            </p>
          </div>

          <div className="mt-8 grid gap-6">
            {screenshots.map((screen, index) => (
              <article
                key={screen.src}
                className="rounded-lg border border-white/10 bg-[#1b1917] p-3 shadow-xl shadow-black/20 sm:p-4"
              >
                <div className="min-w-0 p-1 sm:p-2 lg:flex lg:items-end lg:justify-between lg:gap-6">
                  <div className="max-w-3xl">
                    <div className="text-sm font-medium text-[#d4a574]">{screen.eyebrow}</div>
                    <h3 className="mt-2 text-2xl font-bold">{screen.title}</h3>
                    <p className="mt-3 leading-7 text-[#d6cbbf]">{screen.description}</p>
                  </div>
                  <div className="mt-4 shrink-0 text-sm text-[#a39482] lg:mt-0">ภาพที่ {index + 1} จาก {screenshots.length}</div>
                </div>

                <div className="mt-4 min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20">
                  <Image
                    src={screen.src}
                    alt={`${screen.title} screenshot`}
                    width={screen.width}
                    height={screen.height}
                    sizes="(min-width: 1280px) 1180px, (min-width: 1024px) calc(100vw - 8rem), 100vw"
                    className="h-auto w-full"
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto max-w-6xl rounded-lg border border-[#d4a574]/20 bg-[#d4a574]/10 p-6 sm:p-8">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold">อยากดูว่าระบบนี้เหมาะกับร้านคุณไหม?</h2>
            <p className="mt-3 leading-7 text-[#d6cbbf]">
              ถ้าร้านคุณอยากเริ่มใช้ระบบขายหน้าร้าน สต็อก และปิดยอดรายวัน ลองคุย flow ร้านก่อน
              ผมจะช่วยดูว่าควรเริ่มจากแพ็กทดลองหรือปรับขอบเขตเพิ่ม
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/#contact"
                className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#d4a574] to-[#b38455] px-6 py-3 font-semibold text-white transition hover:brightness-110 sm:w-auto"
              >
                คุย flow ร้านก่อน
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex w-full items-center justify-center rounded-full border border-[#d4a574]/35 bg-[#12100e]/70 px-6 py-3 font-semibold text-[#d6cbbf] transition hover:bg-[#1b1917] sm:w-auto"
              >
                กลับไปดูแพ็กเกจ
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
