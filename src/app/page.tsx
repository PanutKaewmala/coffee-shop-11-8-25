import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Coffee,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

const workflow = [
  {
    step: "01",
    icon: ReceiptText,
    title: "รับออเดอร์และคิดเงิน",
    description: "พอปิดบิล TALVO จะเก็บยอดขาย วิธีจ่าย และรายการที่ลูกค้าซื้อไว้ให้ครบในบิลเดียว",
    signal: "ขายแล้ว ระบบบันทึกให้",
    example: "Americano 60 บาท",
  },
  {
    step: "02",
    icon: Coffee,
    title: "ตัดวัตถุดิบตามสูตร",
    description: "แต่ละเมนูผูกสูตรไว้ พอขาย ระบบจะตัดวัตถุดิบตามที่ใช้จริง ไม่ต้องมานั่งตัดสต็อกเอง",
    signal: "ขาย 1 แก้ว → ตัดตามสูตร",
    example: "เมล็ดกาแฟ −20 กรัม",
  },
  {
    step: "03",
    icon: RotateCcw,
    title: "ยกเลิกบิล ก็เลือกคืนสต็อกได้",
    description: "ถ้าต้องยกเลิกบิล เลือกได้ว่าจะคืนวัตถุดิบกลับเข้าสต็อกไหม ยอดขายกับของในร้านเลยยังตรงกัน",
    signal: "ยกเลิกแล้วเลือกคืนของ",
    example: "เมล็ดกาแฟ +20 กรัม",
  },
  {
    step: "04",
    icon: ClipboardCheck,
    title: "จบวันแล้วเช็กว่าเงินตรงไหม",
    description: "ปลายวัน TALVO จะรวมยอดขายกับเงินที่ควรมี แล้วให้เทียบกับเงินที่นับได้จริงก่อนปิดวัน",
    signal: "ยอดขายเทียบกับเงินจริง",
    example: "ควรมี 120 บาท · นับได้ 120 บาท",
  },
] as const;

const capabilities = [
  {
    icon: ReceiptText,
    title: "รับออเดอร์ได้ไวขึ้น",
    description: "เลือกเมนู ปรับรายละเอียด ใส่บิล รับเงิน แล้วจบงานในหน้าเดียว",
  },
  {
    icon: Boxes,
    title: "สต็อกขยับตามที่ขายจริง",
    description: "พอขายเมนูไหน ระบบจะตัดวัตถุดิบตามสูตรของเมนูนั้น พร้อมดูของเหลือและตั้งเตือนของใกล้หมดได้",
  },
  {
    icon: RotateCcw,
    title: "ยกเลิกบิลแล้วเลือกได้ว่าจะคืนสต็อกไหม",
    description: "เก็บเหตุผลที่ยกเลิกไว้ และเลือกได้ว่าจะคืนวัตถุดิบกลับเข้าสต็อกหรือไม่",
  },
  {
    icon: ClipboardCheck,
    title: "ปิดยอดแล้วเช็กเงินง่าย",
    description: "เทียบยอดขายกับเงินที่นับได้จริง เห็นส่วนต่างก่อนปิดวัน และกลับมาดูย้อนหลังได้",
  },
  {
    icon: ShieldCheck,
    title: "เจ้าของกับพนักงาน แยกสิทธิ์กันชัดเจน",
    description: "พนักงานทำงานหน้าร้านได้ ส่วนงานสำคัญอย่างปิดยอดหรือยกเลิกบางกรณีให้เจ้าของเป็นคนจัดการ",
  },
  {
    icon: BadgeCheck,
    title: "เห็นของใกล้หมดก่อนต้องไล่เช็กเอง",
    description: "หน้าแรกช่วยบอกว่าวัตถุดิบอะไรใกล้หมด มีอะไรต้องเช็ก และวันนี้ร้านมีเรื่องไหนที่ควรดูเป็นพิเศษ",
  },
] as const;

const plans = [
  {
    name: "เมนูออนไลน์",
    setup: "1,500 บาท",
    monthly: "300 บาท / เดือน",
    description: "เหมาะกับร้านที่อยากมีหน้าเมนู ราคา และข้อมูลร้านให้ลูกค้าเปิดดูได้ง่าย ๆ",
    items: ["หน้าเมนูให้ลูกค้าดู", "หมวดหมู่และราคา", "ข่าวสารและช่องทางติดต่อ"],
    cta: "ดูตัวอย่างหน้าร้าน",
    href: "/coffeespace-a",
    featured: false,
  },
  {
    name: "TALVO ร้านเดียว",
    setup: "2,500 บาท",
    monthly: "500 บาท / เดือน",
    description: "เหมาะกับร้าน 1 สาขาที่อยากให้การขาย สต็อก และการเช็กเงินปลายวันอยู่ในที่เดียวกัน",
    items: ["รับออเดอร์ + คิดเงิน + ดูบิล", "สูตรเมนู + สต็อก", "ยกเลิกบิล + คืนสต็อก + ปิดยอด"],
    cta: "ลองดูหน้าจอจริง",
    href: "/demo-system",
    featured: true,
  },
  {
    name: "ปรับตามร้าน",
    setup: "เริ่มต้น 10,000 บาท",
    monthly: "ประเมินตามงานที่ต้องทำ",
    description: "ถ้าร้านมีวิธีทำงานเฉพาะหรืออยากเพิ่มรายงานและสิทธิ์การใช้งาน ค่อยคุยรายละเอียดแล้วปรับให้เข้ากับร้าน",
    items: ["ดูวิธีทำงานของร้านก่อน", "เลือกสิ่งที่ต้องปรับจริง ๆ", "กำหนดสิทธิ์ให้เหมาะกับแต่ละคน"],
    cta: "คุยรายละเอียด",
    href: "#contact",
    featured: false,
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="relative px-4 pb-24 pt-20 md:pb-32 md:pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(circle_at_72%_18%,rgba(169,120,69,0.10),transparent_42%)]" />
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/45 px-4 py-2 text-sm font-medium text-accent dark:border-white/10 dark:bg-white/[0.04]">
              <Sparkles size={16} />
              TALVO · ช่วยให้งานหน้าร้านต่อกันง่ายขึ้น
            </div>

            <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-[-0.04em] md:text-6xl">
              รับออเดอร์ ตัดสต็อก และเช็กยอด
              <span className="text-accent"> ให้อยู่ในที่เดียว</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-9 text-text-secondary">
              ถ้าร้านเริ่มเจอปัญหายอดขาย เงินสด และสต็อกไม่ค่อยตรงกัน TALVO ช่วยเชื่อมตั้งแต่รับออเดอร์
              ตัดวัตถุดิบ ไปจนถึงเช็กยอดปลายวัน ทุกอย่างย้อนดูได้จากที่เดียว
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/demo-system"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 font-medium text-white shadow-[0_10px_24px_rgba(169,120,69,0.18)] transition hover:bg-accent-dark"
              >
                ลองดูหน้าจอจริง
                <ArrowRight size={18} />
              </Link>
              <Link
                href="#workflow"
                className="inline-flex items-center justify-center rounded-full border border-black/[0.08] bg-transparent px-7 py-3.5 font-medium text-text-primary transition hover:bg-white/55 dark:border-white/10"
              >
                ดูว่าระบบทำงานยังไง
              </Link>
            </div>

            <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
              {["รับออเดอร์และคิดเงิน", "ตัดสต็อกตามสูตร", "เช็กยอดก่อนปิดวัน"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-text-secondary">
                  <CheckCircle2 size={17} className="text-accent" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[28px] border border-black/[0.06] bg-[#fffdf9] shadow-[0_30px_80px_rgba(46,45,42,0.08)] dark:border-white/10 dark:bg-surface">
              <div className="flex items-center gap-2 border-b border-black/[0.05] px-4 py-3 dark:border-white/10">
                <span className="h-2.5 w-2.5 rounded-full bg-accent/35" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/15" />
                <span className="ml-2 text-xs font-medium text-text-muted">หน้ารับออเดอร์</span>
              </div>
              <Image
                src="/talvo-product/pos.png"
                alt="หน้าขายของ TALVO"
                width={1440}
                height={900}
                priority
                className="h-auto w-full"
              />
            </div>

            <div className="absolute -bottom-6 left-4 right-4 grid gap-2 rounded-2xl border border-black/[0.06] bg-[#fffdf9]/95 p-5 shadow-[0_18px_45px_rgba(46,45,42,0.09)] backdrop-blur sm:left-auto sm:right-6 sm:w-[320px] dark:border-white/10 dark:bg-surface/95">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">ขาย 1 แก้ว ระบบทำอะไรให้บ้าง</div>
              <div className="font-semibold">Americano 60 บาท → ตัดเมล็ดกาแฟ 20 กรัม</div>
              <div className="text-sm text-text-secondary">ขายครั้งเดียว ยอดขายกับสต็อกขยับพร้อมกัน</div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-28 border-y border-black/[0.05] bg-[#faf7f1] px-4 py-20 md:py-28 dark:border-white/10 dark:bg-surface/30">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div className="max-w-2xl">
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">ขาย 1 แก้ว แล้วเกิดอะไรขึ้นบ้าง</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">ตั้งแต่รับเงิน ไปจนถึงสต็อกและยอดปลายวัน</h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-text-secondary lg:justify-self-end">
              ลองไล่ดูง่าย ๆ ว่าพอขายหนึ่งแก้ว ระบบบันทึกอะไร ตัดอะไร ถ้ายกเลิกต้องคืนอะไร
              แล้วตอนจบวันเอาตัวเลขทั้งหมดมาเช็กกันยังไง
            </p>
          </div>

          <div className="mt-12 rounded-[30px] border border-black/[0.06] bg-[#fffdf9]/60 p-5 md:p-8 dark:border-white/10 dark:bg-surface/40">
            <div className="grid gap-3 lg:grid-cols-4">
              {workflow.map(({ step, icon: Icon, title, description, signal, example }, index) => (
                <div key={step} className="relative">
                  <article className="h-full rounded-2xl border border-black/[0.055] bg-white/45 p-6 dark:border-white/10 dark:bg-white/[0.025]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <Icon size={20} />
                      </div>
                      <div className="text-xs font-bold tracking-[0.18em] text-text-muted">{step}</div>
                    </div>
                    <h3 className="mt-5 text-xl font-bold">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-text-secondary">{description}</p>
                    <div className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{signal}</div>
                      <div className="mt-1 font-semibold">{example}</div>
                    </div>
                  </article>
                  {index < workflow.length - 1 && (
                    <div className="pointer-events-none absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-accent/20 bg-background text-accent lg:-right-[18px] lg:bottom-auto lg:left-auto lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0">
                      <ArrowRight size={13} className="rotate-90 lg:rotate-0" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-black/[0.05] bg-[#eee6da] px-5 py-4 text-text-primary sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-[#1b1916] dark:text-white">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a6d3d] dark:text-[#c69a67]">ตัวอย่างจริง</div>
                <div className="mt-1 font-semibold">ขาย Americano 60 บาท → ตัดเมล็ดกาแฟ 20 กรัม → ถ้ายกเลิกก็คืนได้ → ปลายวันเอายอดไปเช็กเงิน</div>
              </div>
              <Link href="/demo-system" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#9a6d3d] dark:text-[#c69a67]">
                ดูหน้าจอจริงต่อ
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-28 px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="max-w-xl">
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">TALVO ช่วยอะไรในร้านบ้าง</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">งานหลักที่ต้องทำทุกวัน เอามาไว้ด้วยกัน</h2>
              <p className="mt-4 leading-7 text-text-secondary">
                เริ่มจากงานที่ร้านใช้ทุกวันก่อน แล้วให้ข้อมูลจากแต่ละส่วนต่อกันเอง ไม่ต้องจดซ้ำหลายที่
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-black/[0.055] bg-[#fbf8f2] p-6 dark:border-white/10 dark:bg-surface/55">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-8 md:py-12">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[30px] border border-black/[0.06] bg-[#eee7dd] text-text-primary lg:grid-cols-[0.85fr_1.15fr] dark:border-white/10 dark:bg-[#1b1916] dark:text-white">
          <div className="flex flex-col justify-center p-7 md:p-10">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#9a6d3d] dark:text-[#c69a67]">ก่อนกลับบ้าน เช็กให้ชัวร์ว่าเงินตรง</div>
            <h2 className="mt-3 text-3xl font-bold">จบวันแล้วรู้ว่าเงินวันนี้ตรงไหม</h2>
            <p className="mt-4 leading-7 text-[#68625b] dark:text-[#cbc4ba]">
              TALVO จะรวมยอดขายและเงินที่ควรมีไว้ให้ แล้วให้ใส่ยอดที่นับได้จริงเพื่อดูว่าตรงกันไหม
              พอยืนยันปิดวันแล้ว ระบบจะไม่ให้เปิดบิลเพิ่มในวันนั้น
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["ยอดขายวันนี้", "เงินที่ควรมี", "เงินที่นับได้จริง", "ต่างกันเท่าไร"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-[#68625b] dark:text-[#cbc4ba]">
                  <CheckCircle2 size={16} className="text-[#9a6d3d] dark:text-[#c69a67]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <Image
            src="/talvo-product/daily-close.png"
            alt="หน้าปิดยอดรายวันของ TALVO"
            width={1440}
            height={900}
            className="h-full w-full object-cover object-top"
          />
        </div>
      </section>

      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          <div className="rounded-[26px] border border-black/[0.06] bg-[#fbf8f2] p-7 md:p-8 dark:border-white/10 dark:bg-surface/45">
            <div className="flex items-center gap-2 font-semibold text-accent">
              <CheckCircle2 size={20} />
              TALVO น่าจะเหมาะ ถ้าร้านคุณ…
            </div>
            <ul className="mt-5 space-y-3 text-text-secondary">
              <li>• เป็นร้านกาแฟหรือร้านเครื่องดื่ม 1 สาขา</li>
              <li>• เริ่มมีพนักงาน และอยากให้ทุกคนทำงานเป็นทางเดียวกัน</li>
              <li>• อยากให้ยอดขาย สต็อก และเงินปลายวันตรงกันมากขึ้น</li>
              <li>• อยากย้อนดูได้ว่าแต่ละวันขายอะไร เงินเท่าไร และสต็อกขยับยังไง</li>
            </ul>
          </div>

          <div className="rounded-[26px] border border-black/[0.06] bg-[#fbf8f2] p-7 md:p-8 dark:border-white/10 dark:bg-surface/45">
            <div className="flex items-center gap-2 font-bold">
              <XCircle size={20} className="text-accent" />
              อาจยังไม่เหมาะ ถ้าร้านคุณต้องการ…
            </div>
            <ul className="mt-5 space-y-3 text-text-secondary">
              <li>• ระบบสำหรับเครือร้านหลายสิบสาขา</li>
              <li>• ระบบบัญชีและภาษีแบบครบวงจร</li>
              <li>• เชื่อมอุปกรณ์เฉพาะทางที่ต้องพัฒนาเพิ่ม</li>
              <li>• ขั้นตอนเฉพาะร้านที่ต้องออกแบบใหม่ทั้งหมด</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-28 border-y border-black/[0.05] bg-[#faf7f1] px-4 py-20 md:py-28 dark:border-white/10 dark:bg-surface/30">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">ราคา</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">เริ่มจากเท่าที่ร้านใช้จริง ไม่ต้องซื้อเกินจำเป็น</h2>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex flex-col rounded-[26px] border p-6 ${
                  plan.featured
                    ? "border-accent/30 bg-[#fffdf9] shadow-[0_18px_55px_rgba(46,45,42,0.07)] ring-1 ring-accent/10 dark:bg-background"
                    : "border-black/[0.055] bg-[#fbf8f2] dark:border-white/10 dark:bg-background/60"
                }`}
              >
                {plan.featured && (
                  <div className="mb-4 inline-flex w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">แนะนำ</div>
                )}
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-text-secondary">{plan.description}</p>
                <div className="mt-5 rounded-2xl border border-black/[0.05] bg-[#f6f1e8] p-4 dark:border-white/10 dark:bg-surface">
                  <div className="text-xs text-text-muted">ค่าติดตั้ง</div>
                  <div className="mt-1 text-xl font-bold text-accent">{plan.setup}</div>
                  <div className="mt-3 border-t border-accent/10 pt-3 text-sm font-semibold">{plan.monthly}</div>
                </div>
                <ul className="mt-5 space-y-3 text-sm text-text-secondary">
                  {plan.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-semibold transition lg:mt-auto lg:translate-y-2 ${
                    plan.featured
                      ? "bg-accent text-white hover:bg-accent-dark"
                      : "border border-accent/25 hover:border-accent/50"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-28 px-4 py-20 md:py-28">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-black/[0.06] bg-[#fbf8f2] p-7 md:p-10 dark:border-white/10 dark:bg-background">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">อยากเห็นตอนใช้งานจริง?</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">ลองเปิดดูทีละหน้า ว่าคนในร้านต้องกดอะไรบ้าง</h2>
              <p className="mt-4 leading-7 text-text-secondary">
                มีตัวอย่างหน้าที่ใช้จริงให้ดูตั้งแต่รับออเดอร์ ตั้งสูตร เช็กสต็อก
                ย้อนดูบิล ไปจนถึงปิดยอด
              </p>
              <Link
                href="/demo-system"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-dark"
              >
                ดูหน้าจอจริง
                <ArrowRight size={17} />
              </Link>
            </div>

            <div className="rounded-[24px] border border-black/[0.05] bg-[#eee7dd] p-6 text-text-primary md:p-8 dark:border-white/10 dark:bg-[#1b1916] dark:text-white">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a6d3d] dark:text-[#c69a67]">6 หน้าหลักที่ใช้ในร้าน</div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["01", "รับออเดอร์", "เลือกเมนู รับเงิน และปิดบิล"],
                  ["02", "สูตรเมนู", "บอกว่าหนึ่งแก้วใช้วัตถุดิบอะไรบ้าง"],
                  ["03", "สต็อก", "ดูของเหลือ รับของเข้า และตั้งเตือน"],
                  ["04", "รายการขาย", "ย้อนดูบิลที่ขายไปแล้ว"],
                  ["05", "ยกเลิกบิล", "บันทึกเหตุผลและเลือกคืนสต็อก"],
                  ["06", "ปิดยอด", "เทียบเงินแล้วจบวัน"],
                ].map(([step, title, description]) => (
                  <div key={step} className="rounded-2xl border border-black/[0.06] bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                    <div className="text-xs font-bold text-[#9a6d3d] dark:text-[#c69a67]">{step}</div>
                    <div className="mt-1 font-semibold">{title}</div>
                    <div className="mt-1 text-sm text-[#6b655e] dark:text-[#b8aa9b]">{description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-28 px-4 pb-20 pt-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-black/[0.06] bg-[#fbf8f2] p-8 md:p-11 dark:border-white/10 dark:bg-surface">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold">อยากรู้ว่า TALVO เข้ากับร้านคุณไหม?</h2>
              <p className="mt-4 leading-7 text-text-secondary">
                เล่าให้ฟังได้ว่าตอนนี้ร้านรับออเดอร์ เก็บเงิน เช็กสต็อก และปิดยอดกันยังไง
                แล้วค่อยดูด้วยกันว่า TALVO ใช้ได้เลยหรือควรปรับตรงไหนก่อน
              </p>
              <div className="mt-5 text-sm leading-7 text-text-secondary">
                <div>LINE: <span className="font-semibold text-foreground">gkaewmala</span></div>
                <div>Facebook: <span className="font-semibold text-foreground">Panut Kaewmala</span></div>
                <div>โทร: <a href="tel:0630427563" className="font-semibold text-accent hover:underline">063-042-7563</a></div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <Link href="/demo-system" className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white hover:bg-accent-dark">
                ลองดูหน้าจอจริง
                <ArrowRight size={17} />
              </Link>
              <a href="tel:0630427563" className="inline-flex items-center justify-center rounded-full border border-black/[0.08] bg-transparent px-6 py-3 font-medium dark:border-white/10">
                โทรคุยกัน
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
