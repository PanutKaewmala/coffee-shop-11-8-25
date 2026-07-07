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
    title: "POS ขายหน้าร้าน",
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
    name: "Starter Online Menu",
    price: "1,500-2,500 บาท",
    billing: "ตั้งค่าเริ่มต้น / ดูแลรายเดือน 300 บาท",
    detail: "เหมาะกับร้านที่อยากมีเมนูออนไลน์และข้อมูลร้านให้ลูกค้าสแกนดู",
  },
  {
    name: "POS + Stock MVP",
    price: "4,900-7,900 บาท",
    billing: "ตั้งค่าเริ่มต้น / ดูแลรายเดือน 700-1,500 บาท",
    detail: "เหมาะกับร้านที่อยากขายผ่าน POS ดูออเดอร์ หักสต็อก และปิดยอดรายวัน",
  },
  {
    name: "Custom Shop System",
    price: "เริ่มต้น 10,000 บาท",
    billing: "รายเดือนตามขอบเขตงาน",
    detail: "เหมาะกับร้านที่ต้องการปรับระบบตาม workflow เฉพาะของร้าน",
  },
];

const pilotScopeItems = [
  "สำหรับร้านเล็ก 1 สาขา",
  "เริ่มจาก 5-10 เมนู",
  "ทดลองใช้งานจริงช่วงเวลาคนน้อย 2-3 วัน",
  "เหมาะกับร้านแรกที่ต้องการเริ่มเล็กก่อน",
];

const pilotExcludedItems = [
  "stock เต็มระบบทุกเมนู",
  "offline mode",
  "audit log ละเอียดทุก action",
  "custom reports",
  "multi-branch full setup",
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
                ระบบจัดการร้านกาแฟเล็ก
              </h1>
              <p className="max-w-2xl text-lg text-text-secondary">
                ขายหน้าร้าน ดูยอดขาย หักสต็อก และปิดยอดรายวันในที่เดียว
              </p>
              <p className="max-w-2xl text-base text-text-secondary">
                เหมาะสำหรับร้านกาแฟ ร้านน้ำ และร้านเครื่องดื่มเล็ก ๆ ที่อยากเริ่มจัดการข้อมูลให้เป็นระบบ
                โดยไม่ต้องใช้ระบบใหญ่เกินความจำเป็น
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/coffeespace-a"
                  className="rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110"
                >
                  ขอดูตัวอย่างระบบ
                </Link>
                <Link
                  href="#contact"
                  className="rounded-full border border-accent/30 bg-surface/80 px-6 py-3 font-semibold text-text-secondary transition hover:bg-surface"
                >
                  ทักเพื่อคุยรายละเอียด
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

      <section id="features" className="scroll-mt-28 px-4 py-12 md:py-16">
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

      <section id="pricing" className="scroll-mt-28 px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl rounded-3xl border border-accent/10 bg-surface/80 p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold">แพ็กเกจเริ่มต้น</h2>
              <p className="mt-2 max-w-2xl text-text-secondary">
                เหมาะกับร้านเล็กที่อยากเริ่มจัดการข้อมูลให้เป็นระบบอย่างค่อยเป็นค่อยไป
                โดยมีทั้งแพ็กทดลองร้านแรกและแพ็กเกจปกติตามขอบเขตงาน
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-accent/20 bg-background/80 p-6">
            <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <div className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
                  แพ็กทดลองร้านแรก / Pilot Scope
                </div>
                <h3 className="mt-4 text-2xl font-bold">เริ่มเล็กก่อน ใช้งานจริงก่อน</h3>
                <p className="mt-3 text-text-secondary">
                  สำหรับร้านที่อยากลองระบบกับงานขายจริงในขอบเขตเล็ก เพื่อดูว่า workflow ของร้านเหมาะกับระบบแค่ไหน
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-accent/10 bg-surface/70 p-4">
                    <div className="text-sm text-text-secondary">ค่าตั้งค่าระบบ</div>
                    <div className="mt-1 text-3xl font-bold text-accent">2,500 บาท</div>
                  </div>
                  <div className="rounded-xl border border-accent/10 bg-surface/70 p-4">
                    <div className="text-sm text-text-secondary">รายเดือน</div>
                    <div className="mt-1 text-3xl font-bold text-accent">500 บาท</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-accent/10 bg-surface/70 p-4">
                  <h4 className="font-semibold">ขอบเขตแพ็กทดลอง</h4>
                  <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                    {pilotScopeItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-accent/10 bg-surface/70 p-4">
                  <h4 className="font-semibold">ยังไม่รวมในแพ็กนี้</h4>
                  <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                    {pilotExcludedItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <h3 className="mt-8 text-xl font-semibold">แพ็กเกจปกติ</h3>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div key={plan.name} className="rounded-2xl border border-accent/10 bg-background/80 p-6">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-3 text-text-secondary">{plan.detail}</p>
                <div className="mt-5">
                  <div className="text-2xl font-bold text-accent">{plan.price}</div>
                  <div className="mt-1 text-sm text-text-secondary">{plan.billing}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-accent/10 bg-background/70 p-4 text-text-secondary">
            ระบบนี้เหมาะกับร้านเล็กที่ต้องการเริ่มจัดการข้อมูลให้เป็นระบบ ยังไม่ใช่ระบบ enterprise ขนาดใหญ่
            และเหมาะกับช่วงทดลองใช้หรือ pilot เพื่อดูว่า workflow ของร้านควรจัดอย่างไร
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-28 px-4 py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold">ดูตัวอย่างระบบจากร้าน Demo</h2>
            <p className="mt-4 text-text-secondary">
              เปิดดูหน้า CoffeeSpace A เพื่อเห็นตัวอย่างหน้าเว็บร้านกาแฟ เมนูออนไลน์ ข่าวสาร และช่องทางติดต่อของร้าน
              โดยไม่กระทบข้อมูลร้านจริง
            </p>
            <Link
              href="/coffeespace-a"
              className="mt-6 inline-flex rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110"
            >
              ขอดูตัวอย่างระบบ
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

      <section id="contact" className="scroll-mt-28 px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl rounded-3xl border border-accent/10 bg-gradient-to-r from-accent/10 to-accent-dark/10 p-6 shadow-sm md:p-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold">ช่องทางติดต่อช่วงทดลองระบบ</h2>
            <p className="mt-4 text-lg text-text-secondary">
              ติดต่อสอบถามข้อมูลช่วงทดลอง รับชมตัวอย่างระบบ และพูดคุยเกี่ยวกับปัญหาที่อยากให้ระบบช่วยจัดการได้เลย
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/coffeespace-a"
                className="rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110"
              >
                ขอดูตัวอย่างระบบ
              </Link>
              <a
                href="tel:0630427563"
                className="rounded-full border border-accent/30 bg-background/80 px-6 py-3 font-semibold text-text-secondary transition hover:bg-surface"
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
