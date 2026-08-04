import LogoutButton from "@/components/LogoutButton";

export default function NoAccessPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6 text-[var(--text-primary)]">
            <section className="w-full max-w-lg rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-6 text-center shadow-sm">
                <h1 className="text-2xl font-bold">ไม่สามารถเข้าใช้งานร้านได้</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    บัญชีนี้ไม่มีสิทธิ์ของร้านที่รองรับ หรือสิทธิ์การใช้งานไม่ถูกต้อง กรุณาติดต่อเจ้าของร้านหรือผู้ดูแลระบบ
                </p>
                <div className="mt-6"><LogoutButton /></div>
            </section>
        </main>
    );
}
