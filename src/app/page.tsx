import Link from "next/link";

const problems = [
  "จดออเดอร์ด้วยกระดาษแล้วตามยอดยาก",
  "ยอดขาย เงินสด และพร้อมเพย์กระจัดกระจาย",
  "สต็อกวัตถุดิบไม่ตรงกับยอดขายจริง",
  "ไม่รู้ว่าวันนี้ขายอะไรดีหรือขายได้เท่าไหร่",
  "ปิดยอดรายวันแล้วข้อมูลย้อนหลังยังแก้ปนกันได้",
];

const features = [
  {
    title: "เมนูออนไลน์",
    description: "ให้ลูกค้าสแกนดูเมนู ราคา หมวดหมู่ และข้อมูลร้านได้ง่าย",
  },
  {
    title: "ระบบขายหน้าร้าน",
    description: "เลือกเมนู เพิ่มลงตะกร้า รับชำระเงิน และสร้างออเดอร์ได้ในหน้าเดียว",
  },
  {
    title: "ใบเสร็จ",
    description: "ออกใบเสร็จหลังขาย และสามารถเปิดดูหรือพิมพ์ซ้ำจากหลังบ้านได้",
  },
  {
    title: "ออเดอร์และยอดขาย",
    description: "ดูรายการออเดอร์ สถานะ วิธีชำระเงิน ยอดรวม และรายละเอียดแต่ละบิล",
  },
  {
    title: "สต็อกวัตถุดิบและสูตร",
    description: "ผูกเมนูกับวัตถุดิบ เพื่อให้ระบบช่วยหักสต็อกตามการขายจริง",
  },
  {
    title: "ปิดยอดรายวัน",
    description: "สรุปยอดขาย เงินเข้าออก และล็อกข้อมูลหลังปิดวันเพื่อลดความผิดพลาด",
  },
];

const pricingPlans = [
  {
    name: "เมนูออนไลน์",
    eyebrow: "หน้าร้านออนไลน์ / เมนู / ข่าวสาร / ติดต่อ",
    setup: "ค่าตั้งค่า 1,500 บาท",
    monthly: "รายเดือน 300 บาท",
    bestFor: "เหมาะกับร้านที่อยากมีหน้าเมนูและข้อมูลร้านให้ลูกค้าดูก่อน ยังไม่ใช่ระบบขายหน้าร้าน",
    includes: [
      "หน้าแรก / เมนู / ข่าวสาร / ติดต่อ",
      "ข้อมูลร้านและช่องทางติดต่อ",
      "รายการเมนูพื้นฐานพร้อมราคา",
    ],
    excludes: [
      "ระบบขายหน้าร้าน",
      "รายการออเดอร์และใบเสร็จ",
      "สูตรเมนู หักสต็อก และปิดยอดรายวัน",
    ],
    ctas: [{ label: "ดูตัวอย่างหน้าร้าน", href: "/coffeespace-a", primary: false }],
  },
  {
    name: "แพ็กทดลองร้านแรก",
    eyebrow: "ระบบขายหน้าร้าน + ออเดอร์ + ใบเสร็จ + สต็อก",
    setup: "ค่าตั้งค่า 2,500 บาท",
    monthly: "รายเดือน 500 บาท",
    bestFor: "เหมาะกับร้านกาแฟ/ร้านเครื่องดื่ม 1 สาขา ที่อยากลองใช้กับยอดขายจริง",
    noteLabel: "เพิ่มจากเมนูออนไลน์",
    note: "ใช้ขายหน้าร้านจริง ดูออเดอร์ ออกใบเสร็จ หักสต็อก และปิดยอดรายวัน",
    recommended: true,
    includes: [
      "ทุกอย่างในเมนูออนไลน์",
      "ระบบขายหน้าร้านและรายการออเดอร์",
      "ประวัติยอดขายและใบเสร็จ",
      "สูตรเมนู หักสต็อกตามยอดขาย และประวัติสต็อก",
      "ปิดยอดรายวันและล็อกข้อมูลหลังปิดยอด",
      "แชทซัพพอร์ตช่วงทดลอง",
    ],
    excludes: [
      "โหมดใช้งานออฟไลน์",
      "หลายสาขาเต็มรูปแบบ",
      "รายงานเฉพาะร้านและเชื่อมอุปกรณ์พิเศษ",
      "บันทึกตรวจสอบละเอียดและดูแล 24 ชั่วโมง",
    ],
    ctas: [
      { label: "ดูตัวอย่างระบบหลังบ้าน", href: "/demo-system", primary: true },
      { label: "คุย flow ร้านก่อน", href: "/#contact", primary: false },
    ],
  },
  {
    name: "งานเฉพาะร้าน",
    eyebrow: "ปรับตาม workflow เฉพาะร้าน",
    setup: "ค่าตั้งค่าเริ่มต้น 10,000 บาท",
    monthly: "รายเดือนตามขอบเขต",
    bestFor: "สำหรับร้านที่ใช้ระบบทดลองแล้ว และอยากปรับเพิ่มตาม flow จริงของร้าน",
    noteLabel: "ต้องคุยก่อนเริ่ม",
    note: "ไม่ใช่แพ็กสำเร็จรูป ต้องประเมินขอบเขตและตกลงงานก่อนเริ่มทุกครั้ง",
    includes: [
      "ทุกอย่างในแพ็กทดลองตามขอบเขต",
      "คุย flow ร้านก่อนเริ่ม",
      "ปรับระบบและรายงานตามที่ตกลง",
      "เมนู สูตรเมนู และสต็อกที่ใหญ่ขึ้นตามขอบเขตที่ตกลง",
      "วางแผนสิทธิ์พนักงาน หลายสาขา และสอนใช้งานตามขอบเขตที่ตกลง",
    ],
    excludes: [
      "งานนอกขอบเขตที่ตกลง",
      "การเชื่อมต่ออุปกรณ์ที่ยังไม่ได้ประเมิน",
      "การดูแลระบบนอกข้อตกลง",
    ],
    ctas: [{ label: "คุย flow ร้านก่อน", href: "/#contact", primary: false }],
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex rounded-full border border-accent/30 bg-surface/80 px-4 py-2 text-sm font-medium text-accent">
                ระบบสำหรับร้านกาแฟและร้านดื่มเล็ก ๆ
              </div>
              <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
                เริ่มจัดระบบร้านกาแฟแบบเล็กก่อน
              </h1>
              <p className="max-w-2xl text-lg text-text-secondary">
                ขายหน้าร้าน ดูยอดขาย หักสต็อก และปิดยอดรายวันในที่เดียว
              </p>
              <p className="max-w-2xl text-base text-text-secondary">
                แพ็กทดลองสำหรับร้านกาแฟ ร้านน้ำ และร้านเครื่องดื่ม 1 สาขา ที่อยากลองใช้ระบบขายหน้าร้าน + สต็อก + ปิดยอดรายวัน
                กับงานขายจริง โดยยังไม่ต้องลงทุนกับระบบใหญ่เกินความจำเป็น
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/demo-system"
                  className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110 sm:w-auto"
                >
                  ดูตัวอย่างระบบ
                </Link>
                <Link
                  href="#contact"
                  className="inline-flex w-full items-center justify-center rounded-full border border-accent/30 bg-surface/80 px-6 py-3 font-semibold text-text-secondary transition hover:bg-surface sm:w-auto"
                >
                  คุย flow ร้านก่อน
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-accent/20 bg-surface/90 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">ปัญหาที่ร้านเล็กเจอบ่อย</h2>
              <ul className="mt-4 space-y-3 text-text-secondary">
                {problems.map((problem) => (
                  <li key={problem}>• {problem}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-36 px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold">ระบบนี้ช่วยอะไรได้บ้าง</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-accent/10 bg-surface/80 p-6 shadow-sm">
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 text-text-secondary">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-36 px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
              แพ็กเกจระบบร้านกาแฟ
            </div>
            <h2 className="mt-4 text-3xl font-bold">เลือกเริ่มให้เหมาะกับจังหวะของร้าน</h2>
            <p className="mt-3 text-text-secondary">
              มีตัวเลือกตั้งแต่เมนูออนไลน์ ไปจนถึงแพ็กทดลองที่ใช้ขายจริง และงานเฉพาะร้านที่ต้องคุยขอบเขตก่อนทำ
              โดยแพ็กทดลองคือทางเริ่มต้นที่แนะนำสำหรับร้านเล็ก 1 สาขา
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex min-w-0 flex-col rounded-2xl border p-5 shadow-sm transition ${
                  plan.recommended
                    ? "border-accent/50 bg-gradient-to-b from-accent/15 to-surface/90 ring-1 ring-accent/30 lg:-mt-2"
                    : "border-accent/10 bg-surface/80"
                }`}
              >
                {plan.recommended && (
                  <div className="mb-4 inline-flex w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                    แนะนำ
                  </div>
                )}
                <div className="text-sm font-medium text-accent">{plan.eyebrow}</div>
                <h3 className="mt-2 text-2xl font-bold">{plan.name}</h3>
                <div className="mt-4 grid gap-2 rounded-xl border border-accent/10 bg-background/70 p-4">
                  <div>
                    <div className="text-xl font-bold text-accent">{plan.setup}</div>
                  </div>
                  <div className="border-t border-accent/10 pt-2">
                    <div className="text-xs font-medium text-text-secondary">ค่าระบบรายเดือน</div>
                    <div className="mt-1 text-xl font-bold text-accent">{plan.monthly}</div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  {plan.bestFor}
                </p>
                {plan.note && (
                  <div className="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
                    {plan.noteLabel}: {plan.note}
                  </div>
                )}
                <div className="mt-5 grid gap-4 text-sm text-text-secondary">
                  <div>
                    <div className="font-semibold text-foreground">ได้อะไร</div>
                    <ul className="mt-2 space-y-2">
                      {plan.includes.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">ยังไม่รวม</div>
                    <ul className="mt-2 space-y-2">
                      {plan.excludes.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full border border-accent/60" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-6 flex flex-col gap-2 lg:mt-auto lg:pt-6">
                  {plan.ctas.map((cta) => (
                    <Link
                      key={`${plan.name}-${cta.label}`}
                      href={cta.href}
                      className={
                        cta.primary
                          ? "inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-dark px-5 py-3 text-center font-semibold text-white transition hover:brightness-110"
                          : "inline-flex w-full items-center justify-center rounded-full border border-accent/30 bg-background/80 px-5 py-3 text-center font-semibold text-text-secondary transition hover:bg-surface"
                      }
                    >
                      {cta.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-36 px-4 py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold">ดูตัวอย่างระบบจากภาพหน้าจอจริง</h2>
            <p className="mt-4 text-text-secondary">
              เปิดดู flow หลักของระบบ ตั้งแต่ขายหน้าร้าน ออเดอร์ ใบเสร็จ สูตร สต็อก ไปจนถึงปิดยอดรายวัน
              จากภาพหน้าจอที่จัดไว้ให้ดูเป็นขั้นตอน
            </p>
            <Link
              href="/demo-system"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110 sm:w-auto"
            >
              ดูตัวอย่างระบบ
            </Link>
          </div>

          <div className="rounded-3xl border border-accent/10 bg-surface/80 p-6 shadow-sm">
            <div className="rounded-2xl border border-accent/10 bg-background/80 p-5">
              <div className="flex items-center justify-between gap-4 border-b border-accent/10 pb-4">
                <div>
                  <div className="font-semibold">CoffeeSpace A</div>
                  <div className="text-sm text-text-secondary">Demo coffee shop</div>
                </div>
                <div className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">Public</div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-accent/10 p-4">
                  <div className="text-sm text-text-secondary">เมนูออนไลน์</div>
                  <div className="mt-1 font-semibold">หมวดหมู่ ราคา และรายละเอียดเมนู</div>
                </div>
                <div className="rounded-xl border border-accent/10 p-4">
                  <div className="text-sm text-text-secondary">หน้าร้าน</div>
                  <div className="mt-1 font-semibold">Home, Menu, News, Contact</div>
                </div>
                <div className="rounded-xl border border-accent/10 p-4">
                  <div className="text-sm text-text-secondary">หลังบ้าน</div>
                  <div className="mt-1 font-semibold">จัดการเมนู ออเดอร์ และรายงาน</div>
                </div>
                <div className="rounded-xl border border-accent/10 p-4">
                  <div className="text-sm text-text-secondary">เหมาะสำหรับ</div>
                  <div className="mt-1 font-semibold">ร้านที่เริ่มจัดระบบข้อมูล</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-36 px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl rounded-3xl border border-accent/10 bg-gradient-to-r from-accent/10 to-accent-dark/10 p-6 shadow-sm md:p-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold">ช่องทางติดต่อช่วงทดลองระบบ</h2>
            <p className="mt-4 text-lg text-text-secondary">
              สนใจทดลองใช้กับร้านจริง ทักมาคุย flow ร้านก่อนได้ ผมจะช่วยดูว่าแพ็กทดลองเหมาะกับร้านคุณไหม
              ก่อนตัดสินใจใช้งานจริง
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/demo-system"
                className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110 sm:w-auto"
              >
                ดูตัวอย่างระบบ
              </Link>
              <a
                href="tel:0630427563"
                className="inline-flex w-full items-center justify-center rounded-full border border-accent/30 bg-background/80 px-6 py-3 font-semibold text-text-secondary transition hover:bg-surface sm:w-auto"
              >
                โทรสอบถาม
              </a>
            </div>
            <div className="mt-6 rounded-2xl border border-accent/10 bg-background/70 p-4 text-text-secondary">
              <p className="font-medium">LINE: gkaewmala</p>
              <p className="mt-2">Facebook: Panut Kaewmala</p>
              <p className="mt-2">
                <a href="tel:0630427563" className="text-accent hover:underline">
                  Phone: 063-042-7563
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
