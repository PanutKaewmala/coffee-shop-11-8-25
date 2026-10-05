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
    title: "ขายหน้าร้าน",
    description: "เลือกเมนู ตัวเลือก และวิธีชำระเงินจากหน้า POS เดียว พนักงานเห็นตะกร้าและยอดที่ต้องรับชัดเจน",
    image: "/talvo-product/pos.png",
    alt: "หน้า POS ของ TALVO ที่มี Americano อยู่ในตะกร้า",
  },
  {
    step: "02",
    title: "ตัดวัตถุดิบตามสูตร",
    description: "สูตรเชื่อมเมนูกับวัตถุดิบ เช่น Americano 1 แก้วใช้เมล็ดกาแฟ 20 กรัม เพื่อให้ยอดขายกระทบสต็อกจริง",
    image: "/talvo-product/recipes.png",
    alt: "หน้าสูตรเมนู TALVO ที่ผูก Americano กับเมล็ดกาแฟ 20 กรัม",
  },
  {
    step: "03",
    title: "แก้บิลผิดโดยไม่ทำสต็อกเพี้ยน",
    description: "ยกเลิกออเดอร์ พร้อมเลือกได้ว่าจะคืนวัตถุดิบเข้าสต็อกหรือไม่ และเก็บเหตุผลไว้ตรวจย้อนหลัง",
    image: "/talvo-product/cancel-order.png",
    alt: "หน้ารายละเอียดออเดอร์ที่ถูกยกเลิกและคืนสต็อกใน TALVO",
  },
  {
    step: "04",
    title: "ปิดวันด้วยตัวเลขที่ตรวจได้",
    description: "สรุปยอดขาย เงินสด เงินที่ควรอยู่ในลิ้นชัก เงินที่นับได้จริง และส่วนต่างก่อนล็อกวันขาย",
    image: "/talvo-product/daily-close.png",
    alt: "หน้า Daily Close ของ TALVO หลังปิดยอดสำเร็จ",
  },
] as const;

const capabilities = [
  {
    icon: ReceiptText,
    title: "POS ที่เน้นความเร็ว",
    description: "เลือกเมนู → ใส่ตะกร้า → รับเงิน → ปิดบิล โดยไม่ต้องไล่ผ่านหน้าจอหลายชั้น",
  },
  {
    icon: Boxes,
    title: "สต็อกที่ผูกกับยอดขาย",
    description: "รับของเข้า ดูของพร้อมใช้ ตั้งขั้นต่ำ และให้สูตรเป็นตัวกำหนดว่าขายหนึ่งแก้วต้องตัดอะไร",
  },
  {
    icon: RotateCcw,
    title: "ยกเลิกบิลอย่างมีผลกระทบที่ชัด",
    description: "รู้ว่าบิลถูกยกเลิกเพราะอะไร คืนสต็อกหรือไม่ และไม่ปล่อยให้ยอดขายกับวัตถุดิบเดินคนละทาง",
  },
  {
    icon: ClipboardCheck,
    title: "Daily Close",
    description: "เทียบยอดขายกับเงินจริง ปิดยอด และล็อก snapshot ของวัน เพื่อให้วันถัดไปเริ่มจากฐานที่ชัดเจน",
  },
  {
    icon: ShieldCheck,
    title: "แยกสิทธิ์ Owner / Staff",
    description: "แยกงานที่พนักงานทำได้ออกจากงานที่เจ้าของต้องเป็นคนตัดสินใจ เช่น การปิดยอดและยกเลิกบางกรณี",
  },
  {
    icon: BadgeCheck,
    title: "มองความผิดปกติก่อนต้องนั่งไล่หา",
    description: "Overview ช่วยพาไปยัง stock ต่ำ รายการที่ต้องตรวจ และสถานะสำคัญของสาขาที่กำลังใช้งาน",
  },
] as const;

const plans = [
  {
    name: "เมนูออนไลน์",
    setup: "1,500 บาท",
    monthly: "300 บาท / เดือน",
    description: "สำหรับร้านที่อยากเริ่มจากหน้าเมนูและข้อมูลร้านให้ลูกค้าดูออนไลน์",
    items: ["หน้าเมนูสาธารณะ", "หมวดหมู่และราคา", "ข่าวสารและช่องทางติดต่อ"],
    cta: "ดูตัวอย่างหน้าร้าน",
    href: "/coffeespace-a",
    featured: false,
  },
  {
    name: "TALVO ร้านเดียว",
    setup: "2,500 บาท",
    monthly: "500 บาท / เดือน",
    description: "สำหรับร้านกาแฟหรือร้านเครื่องดื่ม 1 สาขาที่อยากให้ยอดขาย สต็อก และเงินปลายวันอยู่ใน flow เดียวกัน",
    items: ["POS + ออเดอร์ + ใบเสร็จ", "สูตรเมนู + สต็อกพร้อมใช้", "ยกเลิก/คืนสต็อก + Daily Close"],
    cta: "ดู TALVO ทำงานจริง",
    href: "/demo-system",
    featured: true,
  },
  {
    name: "ปรับตามร้าน",
    setup: "เริ่มต้น 10,000 บาท",
    monthly: "ตามขอบเขต",
    description: "สำหรับร้านที่ผ่าน flow หลักแล้วและต้องการสิทธิ์ รายงาน หรือ workflow เฉพาะของตัวเอง",
    items: ["วิเคราะห์ workflow ร้าน", "ปรับระบบตามขอบเขต", "วางแผนสิทธิ์และการใช้งาน"],
    cta: "คุยความต้องการ",
    href: "#contact",
    featured: false,
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="relative px-4 pb-16 pt-16 md:pb-24 md:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(circle_at_70%_20%,rgba(184,137,83,0.18),transparent_42%)]" />
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">
              <Sparkles size={16} />
              TALVO · ระบบจัดการร้านกาแฟ
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.12] tracking-tight md:text-6xl">
              ขายหน้าร้าน ตัดสต็อก และปิดยอด
              <span className="text-accent"> ให้จบในระบบเดียว</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
              สำหรับร้านกาแฟและร้านเครื่องดื่ม 1 สาขา ที่เริ่มเจอปัญหาว่า
              ยอดขาย เงิน และวัตถุดิบไม่ตรงกัน TALVO เชื่อมงานตั้งแต่รับออเดอร์จนถึงปิดวันให้ตรวจย้อนกลับได้
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/demo-system"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 font-semibold text-white transition hover:bg-accent-dark"
              >
                ดู TALVO ทำงานจริง
                <ArrowRight size={18} />
              </Link>
              <Link
                href="#workflow"
                className="inline-flex items-center justify-center rounded-full border border-accent/25 bg-surface/70 px-6 py-3.5 font-semibold text-foreground transition hover:border-accent/50"
              >
                ดู flow การทำงาน
              </Link>
            </div>

            <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
              {["POS ใช้งานจริง", "สต็อกตามสูตร", "ปิดยอดรายวัน"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-text-secondary">
                  <CheckCircle2 size={17} className="text-accent" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[28px] border border-accent/15 bg-surface shadow-2xl shadow-accent/10">
              <div className="flex items-center gap-2 border-b border-accent/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-accent/35" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/15" />
                <span className="ml-2 text-xs font-medium text-text-muted">TALVO POS</span>
              </div>
              <Image
                src="/talvo-product/pos.png"
                alt="TALVO POS"
                width={1440}
                height={900}
                priority
                className="h-auto w-full"
              />
            </div>

            <div className="absolute -bottom-5 left-4 right-4 grid gap-2 rounded-2xl border border-accent/20 bg-background/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:right-6 sm:w-[310px]">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">หนึ่งแก้วเกิดอะไรขึ้น</div>
              <div className="font-semibold">Americano 60 บาท → Beans −20 g</div>
              <div className="text-sm text-text-secondary">ยอดขายและสต็อกเปลี่ยนจาก transaction เดียวกัน</div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-28 border-y border-accent/10 bg-surface/45 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">How TALVO works</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">หนึ่ง flow ตั้งแต่ลูกค้าสั่ง จนเจ้าของปิดร้าน</h2>
            <p className="mt-4 text-lg leading-8 text-text-secondary">
              TALVO ไม่ได้แยก POS, stock และยอดเงินเป็นคนละโลก ทุกส่วนถูกออกแบบให้ต่อกันเป็นเหตุและผล
            </p>
          </div>

          <div className="mt-10 grid gap-8">
            {workflow.map((item, index) => (
              <article
                key={item.step}
                className="grid overflow-hidden rounded-[28px] border border-accent/10 bg-background shadow-sm lg:grid-cols-[0.4fr_0.6fr]"
              >
                <div className="flex flex-col justify-center p-6 md:p-8 lg:p-10">
                  <div className="text-sm font-bold tracking-[0.2em] text-accent">STEP {item.step}</div>
                  <h3 className="mt-3 text-2xl font-bold md:text-3xl">{item.title}</h3>
                  <p className="mt-4 leading-7 text-text-secondary">{item.description}</p>
                  {index === 1 && (
                    <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
                      <Coffee size={16} />
                      Americano = เมล็ดกาแฟ 20 g
                    </div>
                  )}
                </div>
                <div className="border-t border-accent/10 bg-[#efe9e2] lg:border-l lg:border-t-0">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    width={1440}
                    height={900}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-28 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="max-w-xl">
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">What you get</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">สิ่งที่ร้านต้องใช้ทุกวัน โดยไม่ต้องเริ่มจากระบบใหญ่</h2>
              <p className="mt-4 leading-7 text-text-secondary">
                เราโฟกัสงานที่เกิดทุกวันในร้านหนึ่งสาขาก่อน แล้วทำให้แต่ละงานส่งข้อมูลต่อกันได้จริง
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-accent/10 bg-surface/65 p-5">
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
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[30px] border border-accent/15 bg-[#17130f] text-white lg:grid-cols-[0.85fr_1.15fr]">
          <div className="flex flex-col justify-center p-7 md:p-10">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4a574]">Close with confidence</div>
            <h2 className="mt-3 text-3xl font-bold">สิ้นวันรู้ว่าเงินควรเหลือเท่าไร</h2>
            <p className="mt-4 leading-7 text-[#d6cbbf]">
              Daily Close เก็บ snapshot ของยอดขาย วิธีชำระ เงินที่ควรอยู่ในลิ้นชัก เงินที่นับได้จริง และส่วนต่าง
              หลังปิดยอด TALVO จะกันการสร้างบิลใหม่ของวันนั้น
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["ยอดขายรวม", "เงินสดที่ควรมี", "เงินที่นับได้จริง", "ส่วนต่าง"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-[#d6cbbf]">
                  <CheckCircle2 size={16} className="text-[#d4a574]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <Image
            src="/talvo-product/daily-close.png"
            alt="TALVO Daily Close"
            width={1440}
            height={900}
            className="h-full w-full object-cover object-top"
          />
        </div>
      </section>

      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          <div className="rounded-[26px] border border-emerald-500/20 bg-emerald-500/[0.06] p-6 md:p-8">
            <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={20} />
              TALVO เหมาะกับ
            </div>
            <ul className="mt-5 space-y-3 text-text-secondary">
              <li>• ร้านกาแฟหรือร้านเครื่องดื่ม 1 สาขา</li>
              <li>• ร้านที่เริ่มมีพนักงานและต้องการ flow ที่ทุกคนทำตามได้</li>
              <li>• ร้านที่อยากให้ยอดขาย สต็อก และเงินปลายวันสัมพันธ์กัน</li>
              <li>• เจ้าของที่อยากตรวจย้อนหลังโดยไม่ต้องรวมข้อมูลจากหลายที่</li>
            </ul>
          </div>

          <div className="rounded-[26px] border border-accent/15 bg-surface/60 p-6 md:p-8">
            <div className="flex items-center gap-2 font-bold">
              <XCircle size={20} className="text-accent" />
              สิ่งที่ยังไม่ใช่เป้าหมายหลักตอนนี้
            </div>
            <ul className="mt-5 space-y-3 text-text-secondary">
              <li>• เครือร้านหลายสิบสาขาที่ต้องการระบบ enterprise เต็มรูปแบบ</li>
              <li>• ระบบบัญชีและภาษีครบวงจรแทนซอฟต์แวร์บัญชี</li>
              <li>• การเชื่อม hardware เฉพาะทางที่ยังไม่ได้ประเมิน</li>
              <li>• workflow เฉพาะร้านที่ยังไม่ได้ตกลงขอบเขต</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-28 border-y border-accent/10 bg-surface/45 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">Pricing</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">เริ่มเท่าที่ร้านต้องใช้ แล้วค่อยขยายเมื่อมีเหตุผล</h2>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex flex-col rounded-[26px] border p-6 ${
                  plan.featured
                    ? "border-accent/45 bg-background shadow-xl shadow-accent/10 ring-1 ring-accent/20"
                    : "border-accent/10 bg-background/80"
                }`}
              >
                {plan.featured && (
                  <div className="mb-4 inline-flex w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">แนะนำ</div>
                )}
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-text-secondary">{plan.description}</p>
                <div className="mt-5 rounded-2xl bg-surface p-4">
                  <div className="text-xs text-text-muted">ค่าตั้งค่า</div>
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

      <section id="demo" className="scroll-mt-28 px-4 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-accent">Product proof</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">ไม่ต้องจินตนาการจากรายการฟีเจอร์</h2>
            <p className="mt-4 leading-7 text-text-secondary">
              ดูหน้าจอ TALVO จริง ไล่จาก POS ไปถึงสูตร สต็อก การยกเลิก และ Daily Close พร้อมคำอธิบายว่าทุกหน้าต่อกันอย่างไร
            </p>
            <Link
              href="/demo-system"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-dark"
            >
              เปิด product tour
              <ArrowRight size={17} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              ["/talvo-product/stock.png", "สต็อกพร้อมใช้"],
              ["/talvo-product/orders.png", "ออเดอร์"],
              ["/talvo-product/cancel-order.png", "ยกเลิกและคืนสต็อก"],
              ["/talvo-product/overview.png", "Overview"],
            ].map(([src, label]) => (
              <div key={src} className="overflow-hidden rounded-2xl border border-accent/10 bg-surface shadow-sm">
                <Image src={src} alt={label} width={1440} height={900} className="aspect-[16/10] w-full object-cover object-top" />
                <div className="px-4 py-3 text-sm font-semibold">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-28 px-4 pb-20 pt-8">
        <div className="mx-auto max-w-6xl rounded-[30px] border border-accent/15 bg-gradient-to-br from-accent/15 via-surface to-background p-7 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold">อยากลองกับ flow ร้านจริงของคุณ?</h2>
              <p className="mt-4 leading-7 text-text-secondary">
                ส่ง flow ปัจจุบันของร้านมาได้ ว่ารับออเดอร์ เก็บเงิน เช็กสต็อก และปิดยอดกันอย่างไร
                เราจะดูตรงกันก่อนว่า TALVO ร้านเดียวครอบคลุมพอหรือมีอะไรที่ต้องปรับ
              </p>
              <div className="mt-5 text-sm leading-7 text-text-secondary">
                <div>LINE: <span className="font-semibold text-foreground">gkaewmala</span></div>
                <div>Facebook: <span className="font-semibold text-foreground">Panut Kaewmala</span></div>
                <div>โทร: <a href="tel:0630427563" className="font-semibold text-accent hover:underline">063-042-7563</a></div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <Link href="/demo-system" className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white hover:bg-accent-dark">
                ดูระบบก่อน
                <ArrowRight size={17} />
              </Link>
              <a href="tel:0630427563" className="inline-flex items-center justify-center rounded-full border border-accent/25 bg-background/80 px-6 py-3 font-semibold">
                โทรสอบถาม
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
