export default function AdminLoading() {
    return (
        <div className="flex min-h-40 items-center justify-center" role="status" aria-live="polite">
            <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-muted)]/30 border-t-[var(--accent)]" />
                กำลังตรวจสอบสิทธิ์…
            </div>
        </div>
    );
}
