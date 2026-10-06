"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Coffee,
  Expand,
  ListOrdered,
  ReceiptText,
  RotateCcw,
  X,
} from "lucide-react";

const screens = [
  {
    id: "pos",
    label: "ขายหน้าร้าน",
    eyebrow: "01",
    icon: ReceiptText,
    title: "รับออเดอร์และคิดเงิน",
    role: "พนักงานหน้าร้าน",
    job: "เลือกเมนู ปรับรายละเอียดที่ลูกค้าสั่ง เพิ่มลงบิล เลือกวิธีจ่าย แล้วปิดบิลได้จากหน้าเดียว",
    lookFor: ["เลือกเมนูและรายละเอียดทางฝั่งซ้าย", "บิลกับยอดรวมอยู่ทางฝั่งขวา", "กดรับเงินและจบบิลได้จากหน้าเดียว"],
    image: "/talvo-product/pos.png",
    alt: "หน้าขายของ TALVO",
  },
  {
    id: "recipe",
    label: "สูตรเมนู",
    eyebrow: "02",
    icon: Coffee,
    title: "ตั้งสูตรให้แต่ละเมนู",
    role: "เจ้าของร้านหรือผู้ดูแล",
    job: "กำหนดว่าเมนูหนึ่งแก้วใช้วัตถุดิบอะไรและเท่าไร พอขาย ระบบจะได้ตัดสต็อกให้ตรงตามสูตร",
    lookFor: ["เลือกเมนูและขนาดที่ต้องการตั้งสูตร", "เลือกวัตถุดิบที่ใช้", "ใส่ปริมาณที่ใช้ต่อแก้ว"],
    image: "/talvo-product/recipes.png",
    alt: "หน้าสูตรเมนูของ TALVO",
  },
  {
    id: "stock",
    label: "สต็อกพร้อมใช้",
    eyebrow: "03",
    icon: Boxes,
    title: "เช็กสต็อกที่พร้อมใช้",
    role: "เจ้าของร้านหรือผู้ดูแล",
    job: "ดูว่าแต่ละอย่างเหลือเท่าไร รับของเข้า และตั้งจุดเตือนไว้ได้ถ้าของเริ่มใกล้หมด",
    lookFor: ["ของแต่ละอย่างเหลือเท่าไร", "ตั้งเตือนตอนของต่ำกว่าที่กำหนด", "รับของเข้าได้จากหน้านี้เลย"],
    image: "/talvo-product/stock.png",
    alt: "หน้าสต็อกพร้อมใช้ของ TALVO",
  },
  {
    id: "orders",
    label: "ออเดอร์",
    eyebrow: "04",
    icon: ListOrdered,
    title: "ย้อนดูบิลที่ขายไปแล้ว",
    role: "พนักงานหรือเจ้าของร้าน",
    job: "ค้นบิลเก่าแล้วดูได้ว่าขายเมื่อไร จ่ายแบบไหน ยอดเท่าไร และตอนนี้บิลอยู่สถานะอะไร",
    lookFor: ["บิลนี้ชำระแล้วหรือถูกยกเลิก", "ยอดเงินและวิธีจ่าย", "กดเข้าไปดูรายละเอียดของบิลได้"],
    image: "/talvo-product/orders.png",
    alt: "หน้ารายการออเดอร์ของ TALVO",
  },
  {
    id: "cancel",
    label: "ยกเลิกบิล",
    eyebrow: "05",
    icon: RotateCcw,
    title: "ยกเลิกบิล พร้อมเลือกว่าจะคืนของไหม",
    role: "เจ้าของร้าน",
    job: "ตอนยกเลิกบิล ใส่เหตุผลไว้ได้ และเลือกได้ว่าจะคืนวัตถุดิบกลับเข้าสต็อกหรือไม่",
    lookFor: ["มีเหตุผลการยกเลิกเก็บไว้", "เลือกได้ว่าจะคืนสต็อกไหม", "ย้อนกลับมาดูได้ว่าบิลนี้ถูกยกเลิกเมื่อไร"],
    image: "/talvo-product/cancel-order.png",
    alt: "หน้ารายละเอียดออเดอร์ที่ถูกยกเลิกใน TALVO",
  },
  {
    id: "close",
    label: "ปิดยอดรายวัน",
    eyebrow: "06",
    icon: ClipboardCheck,
    title: "เช็กเงินให้ตรงก่อนจบวัน",
    role: "เจ้าของร้าน",
    job: "ดูว่าวันนี้ขายได้เท่าไร เงินควรมีเท่าไร แล้วใส่ยอดที่นับได้จริงเพื่อเช็กส่วนต่างก่อนปิดวัน",
    lookFor: ["ยอดขายรวมและจำนวนบิล", "เงินที่ควรมีเทียบกับเงินที่นับได้จริง", "พอยืนยันแล้ว วันนั้นจะถูกปิดยอด"],
    image: "/talvo-product/daily-close.png",
    alt: "หน้าปิดยอดรายวันของ TALVO",
  },
] as const;

export default function ProductExplorer() {
  const [activeId, setActiveId] = useState<(typeof screens)[number]["id"]>("pos");
  const [expanded, setExpanded] = useState(false);

  const activeIndex = screens.findIndex((screen) => screen.id === activeId);
  const active = screens[activeIndex];
  const ActiveIcon = active.icon;

  const go = (offset: number) => {
    const next = (activeIndex + offset + screens.length) % screens.length;
    setActiveId(screens[next].id);
  };

  return (
    <>
      <section className="px-4 pb-8 pt-10 sm:pt-14">
        <div className="mx-auto max-w-[1380px]">
          <div className="flex flex-col gap-5 border-b border-[#d8ccbf] pb-8 dark:border-white/10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#a76f36] dark:text-[#d4a574]">
                ลองดู TALVO ตอนใช้งานจริง
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#30261f] dark:text-[#f5f3f0] sm:text-4xl lg:text-5xl">
                เลือกหัวข้อ แล้วไล่ดูทีละหน้าได้เลย
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-[#6b5b4c] dark:text-[#b8aa9b]">
                เลือกหัวข้อด้านล่างแล้วดูได้เลยว่าแต่ละหน้ามีไว้ทำอะไร ใครเป็นคนใช้
                และเวลาใช้งานจริงต้องดูตรงไหนบ้าง
              </p>
            </div>

            <Link
              href="/#workflow"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[#cdbba9] bg-white/70 px-4 py-2.5 text-sm font-semibold text-[#5c4b3d] transition hover:bg-[#f1e8df] dark:border-white/15 dark:bg-transparent dark:text-[#d6cbbf] dark:hover:bg-white/[0.05]"
            >
              <ArrowLeft size={16} />
              ดูภาพรวมการทำงานก่อน
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-[1380px]">
          <div className="overflow-hidden rounded-[26px] border border-[#d8ccbf] bg-[#fffdf9] shadow-[0_24px_70px_rgba(103,78,55,0.12)] dark:border-white/10 dark:bg-[#181512] dark:shadow-2xl dark:shadow-black/20">
            <div className="grid min-h-[720px] min-w-0 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
              <aside className="min-w-0 border-b border-[#d8ccbf] bg-[#f3ede6] p-3 dark:border-white/10 dark:bg-[#141210] lg:border-b-0 lg:border-r">
                <div className="mb-3 hidden px-3 pt-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8d7c6b] dark:text-[#7f7367] lg:block">
                  เลือกหน้าที่อยากดู
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {screens.map((screen) => {
                    const Icon = screen.icon;
                    const selected = screen.id === active.id;
                    return (
                      <button
                        key={screen.id}
                        type="button"
                        onClick={() => setActiveId(screen.id)}
                        className={`flex shrink-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition lg:w-full ${
                          selected
                            ? "border-[#b88953]/45 bg-[#ead8c5] text-[#35291f] dark:border-[#d4a574]/35 dark:bg-[#d4a574]/12 dark:text-white"
                            : "border-transparent text-[#6b5b4c] hover:border-[#d8ccbf] hover:bg-white hover:text-[#30261f] dark:text-[#a99b8d] dark:hover:border-white/10 dark:hover:bg-white/[0.035] dark:hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            selected
                              ? "bg-[#b88953] text-white dark:bg-[#d4a574] dark:text-[#17130f]"
                              : "bg-[#e6ddd4] text-[#6b5b4c] dark:bg-white/[0.05] dark:text-[#a99b8d]"
                          }`}
                        >
                          <Icon size={17} />
                        </span>
                        <span>
                          <span className="block text-[10px] font-bold tracking-[0.16em] text-[#9a8066] dark:text-[#8e8174]">
                            {screen.eyebrow}
                          </span>
                          <span className="mt-0.5 block text-sm font-semibold">{screen.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="min-w-0 bg-[#f8f4ef] dark:bg-[#0f0d0c]">
                <div className="flex items-center justify-between border-b border-[#d8ccbf] bg-[#fffdf9] px-4 py-3 dark:border-white/10 dark:bg-[#12100e] sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ead8c5] text-[#9a6331] dark:bg-[#d4a574]/12 dark:text-[#d4a574]">
                      <ActiveIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#30261f] dark:text-[#f5f3f0]">{active.title}</div>
                      <div className="text-xs text-[#8d7c6b] dark:text-[#7f7367]">
                        {activeIndex + 1} / {screens.length}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#d8ccbf] bg-white px-3 py-2 text-xs font-semibold text-[#6b5b4c] transition hover:bg-[#f1e8df] hover:text-[#30261f] dark:border-white/10 dark:bg-transparent dark:text-[#b8aa9b] dark:hover:bg-white/[0.05] dark:hover:text-white"
                  >
                    <Expand size={14} />
                    <span className="hidden sm:inline">ขยายภาพ</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="group block w-full cursor-zoom-in bg-[#ece7e1]"
                  aria-label={`ขยายภาพ ${active.title}`}
                >
                  <Image
                    key={active.image}
                    src={active.image}
                    alt={active.alt}
                    width={1440}
                    height={900}
                    priority={active.id === "pos"}
                    className="h-auto w-full object-contain transition duration-200 group-hover:opacity-95"
                  />
                </button>

                <div className="flex items-center justify-between border-t border-[#d8ccbf] bg-[#fffdf9] px-4 py-3 dark:border-white/10 dark:bg-[#12100e] sm:px-5">
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#6b5b4c] transition hover:text-[#30261f] dark:text-[#a99b8d] dark:hover:text-white"
                  >
                    <ArrowLeft size={15} />
                    ก่อนหน้า
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#9a6331] transition hover:text-[#70461f] dark:text-[#d4a574] dark:hover:text-[#e7bc8d]"
                  >
                    หน้าถัดไป
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>

              <aside className="border-t border-[#d8ccbf] bg-[#f6f0e9] p-6 dark:border-white/10 dark:bg-[#1c1916] lg:border-l lg:border-t-0">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#a76f36] dark:text-[#d4a574]">
                  {active.eyebrow} · {active.label}
                </div>
                <h2 className="mt-3 text-2xl font-bold leading-tight text-[#30261f] dark:text-[#f5f3f0]">{active.title}</h2>

                <div className="mt-6">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8d7c6b] dark:text-[#7f7367]">เหมาะกับ</div>
                  <div className="mt-2 font-semibold text-[#3e3127] dark:text-[#f0ebe5]">{active.role}</div>
                </div>

                <div className="mt-6">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8d7c6b] dark:text-[#7f7367]">หน้านี้เอาไว้ทำอะไร</div>
                  <p className="mt-2 text-sm leading-6 text-[#6b5b4c] dark:text-[#b8aa9b]">{active.job}</p>
                </div>

                <div className="mt-6 border-t border-[#d8ccbf] pt-6 dark:border-white/10">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8d7c6b] dark:text-[#7f7367]">ตอนใช้งาน ให้ดูตรงนี้</div>
                  <ul className="mt-3 space-y-3">
                    {active.lookFor.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-5 text-[#544538] dark:text-[#d6cbbf]">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b88953] dark:bg-[#d4a574]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#d8ccbf] bg-white/65 px-5 py-4 text-sm text-[#6b5b4c] dark:border-white/10 dark:bg-white/[0.025] dark:text-[#a99b8d] sm:flex-row sm:items-center sm:justify-between">
            <span>
              ถ้าดูแล้วอยากเห็นว่าหน้าเหล่านี้เชื่อมกันยังไง ลองกลับไปดูภาพรวมการทำงานของ TALVO ก่อน
            </span>
            <Link href="/#workflow" className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#9a6331] dark:text-[#d4a574]">
              ดูภาพรวม
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {expanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#efe8df]/95 p-3 backdrop-blur-sm dark:bg-black/90 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#cdbba9] bg-white/90 text-[#30261f] shadow-sm dark:border-white/15 dark:bg-black/60 dark:text-white"
            aria-label="ปิดภาพขยาย"
          >
            <X size={20} />
          </button>
          <div className="max-h-full max-w-[1600px] overflow-auto rounded-xl border border-[#d8ccbf] bg-[#ece7e1] shadow-2xl dark:border-white/10">
            <Image
              src={active.image}
              alt={active.alt}
              width={1440}
              height={900}
              className="h-auto w-full"
            />
          </div>
        </div>
      )}
    </>
  );
}
