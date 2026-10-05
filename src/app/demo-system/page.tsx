import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "ดู TALVO ทำงานจริง",
  description: "ดู flow จริงของ TALVO ตั้งแต่ขายหน้าร้าน สูตรเมนู สต็อก ยกเลิกออเดอร์ จนถึงปิดยอดรายวัน",
};

const screens = [
  {
    eyebrow: "01 · POS",
    title: "รับออเดอร์และชำระเงินในหน้าเดียว",
    description: "พนักงานเลือกเมนู ตัวเลือก และวิธีชำระเงินจากหน้าเดียว พร้อมเห็นตะกร้าและยอดรวมก่อนปิดบิล",
    src: "/talvo-product/pos.png",
    alt: "หน้า POS ของ TALVO",
  },
  {
    eyebrow: "02 · Recipe",
    title: "บอกระบบว่าหนึ่งแก้วใช้วัตถุดิบอะไร",
    description: "สูตร Americano ตัวอย่างใช้ TRIAL-01 Beans 20 g ทำให้การขายหนึ่งแก้วมีผลต่อสต็อกแบบตรวจย้อนกลับได้",
    src: "/talvo-product/recipes.png",
    alt: "หน้าสูตรเมนูของ TALVO",
  },
  {
    eyebrow: "03 · Usable stock",
    title: "ดูของที่พร้อมใช้จริง และรับของเข้าได้",
    description: "ดูจำนวนที่พร้อมใช้ ตั้งขั้นต่ำ และรับวัตถุดิบเข้าสต็อกของสาขาโดยไม่ต้องคำนวณจากยอดขายด้วยมือ",
    src: "/talvo-product/stock.png",
    alt: "หน้าสต็อกพร้อมใช้ของ TALVO",
  },
  {
    eyebrow: "04 · Orders",
    title: "ย้อนดูว่าเกิดอะไรขึ้นกับแต่ละบิล",
    description: "สถานะ เวลา วิธีจ่าย และยอดของออเดอร์อยู่ในที่เดียว เพื่อให้ตามเหตุการณ์ย้อนหลังได้ง่าย",
    src: "/talvo-product/orders.png",
    alt: "หน้ารายการออเดอร์ของ TALVO",
  },
  {
    eyebrow: "05 · Cancellation",
    title: "ยกเลิกบิลพร้อมตัดสินใจเรื่องสต็อก",
    description: "บันทึกเหตุผลการยกเลิกและเลือกคืนวัตถุดิบเข้าสต็อกเมื่อเหมาะสม ทำให้ยอดขายกับสต็อกไม่แยกจากกัน",
    src: "/talvo-product/cancel-order.png",
    alt: "หน้ารายละเอียดออเดอร์ที่ถูกยกเลิกใน TALVO",
  },
  {
    eyebrow: "06 · Daily Close",
    title: "ปิดวันด้วยยอดที่ล็อกและตรวจได้",
    description: "ดูยอดขาย เงินที่ควรอยู่ในลิ้นชัก เงินที่นับได้จริง และส่วนต่าง ก่อนล็อก snapshot ของวันขาย",
    src: "/talvo-product/daily-close.png",
    alt: "หน้า Daily Close ของ TALVO",
  },
] as const;

export default function DemoSystemPage() {
  return (
    <main className="min-h-screen bg-[#12100e] text-[#f5f3f0]" data-demo-system-page>
      <section className="relative isolate overflow-hidden px-4 pb-20 pt-16 sm:pt-20">
        <Image
          src="/talvo-product/pos.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-top opacity-20"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#12100e_0%,rgba(18,16,14,.95)_45%,rgba(18,16,14,.72)_100%)]" />

        <div className="mx-auto max-w-6xl py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-[#d4a574]/30 bg-[#d4a574]/10 px-4 py-2 text-sm font-semibold text-[#d4a574]">
              TALVO Product Tour
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              ดู TALVO ทำงานจริง
              <span className="block text-[#d4a574]">ตั้งแต่รับออเดอร์จนปิดยอด</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#d6cbbf] sm:text-lg">
              ภาพทั้งหมดมาจากระบบ TALVO ตัวจริงใน environment ทดลอง
              เราเรียงตาม flow ร้าน เพื่อให้เห็นว่าแต่ละหน้าต่อกันอย่างไร ไม่ใช่แค่รวม screenshot หลายหน้าไว้ด้วยกัน
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#flow"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d4a574] px-6 py-3 font-semibold text-[#12100e] transition hover:bg-[#e0b88b]"
              >
                ไล่ดู flow จริง
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 font-semibold text-[#d6cbbf] transition hover:bg-white/[0.08]"
              >
                ดูราคา
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#1b1917] px-4 py-7">
        <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["POS → order", "Order → stock", "Cancel → restock", "Sales → Daily Close"].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-[#d6cbbf]">
              <CheckCircle2 size={16} className="text-[#d4a574]" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="flow" className="scroll-mt-28 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4a574]">One connected workflow</div>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">ไม่ต้องเดาว่าแต่ละฟีเจอร์เอาไปใช้ตอนไหน</h2>
            <p className="mt-4 leading-8 text-[#d6cbbf]">
              ไล่จากงานที่พนักงานทำตอนขาย ไปจนถึงงานที่เจ้าของทำตอนปิดวัน แล้วดูว่าข้อมูลชุดเดียวกันไหลผ่านระบบอย่างไร
            </p>
          </div>

          <div className="mt-10 grid gap-10">
            {screens.map((screen, index) => (
              <article
                key={screen.src}
                className="overflow-hidden rounded-[26px] border border-white/10 bg-[#1b1917] shadow-2xl shadow-black/20"
              >
                <div className="grid gap-0 lg:grid-cols-[0.32fr_0.68fr]">
                  <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                    <div className="text-sm font-bold tracking-[0.18em] text-[#d4a574]">{screen.eyebrow}</div>
                    <h3 className="mt-3 text-2xl font-bold sm:text-3xl">{screen.title}</h3>
                    <p className="mt-4 leading-7 text-[#d6cbbf]">{screen.description}</p>
                    <div className="mt-6 text-sm text-[#a39482]">{index + 1} / {screens.length}</div>
                  </div>

                  <div className="border-t border-white/10 bg-black/20 lg:border-l lg:border-t-0">
                    <Image
                      src={screen.src}
                      alt={screen.alt}
                      width={1440}
                      height={900}
                      sizes="(min-width: 1024px) 68vw, 100vw"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 pt-4">
        <div className="mx-auto max-w-6xl rounded-[28px] border border-[#d4a574]/20 bg-[#d4a574]/10 p-7 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4a574]">Next step</div>
              <h2 className="mt-3 text-3xl font-bold">ถ้า flow นี้ใกล้กับวิธีทำงานของร้านคุณ</h2>
              <p className="mt-4 leading-7 text-[#d6cbbf]">
                ค่อยคุยต่อว่าร้านมีเมนู วัตถุดิบ วิธีรับเงิน และขั้นตอนปิดยอดแบบไหน
                เพื่อดูว่า TALVO ร้านเดียวครอบคลุมได้เลย หรือควรปรับอะไรเพิ่มก่อนเริ่มใช้จริง
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/#contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d4a574] px-6 py-3 font-semibold text-[#12100e] transition hover:bg-[#e0b88b]"
              >
                คุย flow ร้าน
                <ArrowRight size={17} />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 font-semibold text-[#d6cbbf] transition hover:bg-white/[0.05]"
              >
                กลับหน้า TALVO
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
