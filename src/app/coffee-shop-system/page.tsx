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
    price: "1,500–2,500 บาท",
    billing: "ตั้งค่าเริ่มต้น / ดูแลรายเดือน 300 บาท",
    detail: "เหมาะกับร้านที่อยากมีเมนูออนไลน์และข้อมูลร้านให้ลูกค้าสแกนดู",
  },
  {
    name: "POS + Stock MVP",
    price: "4,900–7,900 บาท",
    billing: "ตั้งค่าเริ่มต้น / ดูแลรายเดือน 700–1,500 บาท",
    detail: "เหมาะกับร้านที่อยากขายผ่าน POS ดูออเดอร์ หักสต็อก และปิดยอดรายวัน",
  },
  {
    name: "Custom Shop System",
    price: "เริ่มต้น 10,000 บาท",
    billing: "รายเดือนตามขอบเขตงาน",
    detail: "เหมาะกับร้านที่ต้องการปรับระบบตาม workflow เฉพาะของร้าน",
  },
];

export default function CoffeeShopSystemPage() {
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
                เหมาะสำหรับร้านกาแฟ ร้านน้ำ และร้านเครื่องดื่มเล็ก ๆ ที่อยากเริ่มจัดการข้อมูลให้เป็นระบบ โดยไม่ต้องใช้ระบบใหญ่เกินความจำเป็น
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="#contact"
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

      <section className="px-4 py-12 md:py-16">
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

      <section id="pricing" className="px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl rounded-3xl border border-accent/10 bg-surface/80 p-8 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold">แพ็กเกจเริ่มต้น</h2>
              <p className="mt-2 max-w-2xl text-text-secondary">
                เหมาะกับร้านเล็กที่อยากเริ่มจัดการข้อมูลให้เป็นระบบอย่างค่อยเป็นค่อยไป
              </p>
            </div>
          </div>

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
          </div>
        </div>
      </section>

      <section id="contact" className="px-4 py-12 md:py-16">
        <div className="mx-auto max-w-6xl rounded-3xl border border-accent/10 bg-gradient-to-r from-accent/10 to-accent-dark/10 p-8 shadow-sm">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold">ช่องทางติดต่อช่วงทดลองระบบ</h2>
            <p className="mt-4 text-lg text-text-secondary">
              ติดต่อสอบถามข้อมูลช่วงทดลอง รับชมตัวอย่างระบบ และพูดคุยเกี่ยวกับปัญหาที่อยากให้ระบบช่วยจัดการได้เลย
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#"
                className="rounded-full bg-gradient-to-r from-accent to-accent-dark px-6 py-3 font-semibold text-white transition hover:brightness-110"
              >
                ขอดูตัวอย่างระบบ
              </Link>
              <Link
                href="#"
                className="rounded-full border border-accent/30 bg-background/80 px-6 py-3 font-semibold text-text-secondary transition hover:bg-surface"
              >
                ทักเพื่อคุยรายละเอียด
              </Link>
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
