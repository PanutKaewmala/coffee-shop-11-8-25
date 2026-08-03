"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportsSalesGranularity, ReportsSalesTrendBucket } from "@/lib/reportsSales";
import { formatReportsMoney, formatReportsTrendBucketLabel, formatTrendTick } from "@/lib/reportsSalesPresentation";

type TooltipEntry = { payload?: ReportsSalesTrendBucket };

function SalesTooltip({ active, payload, granularity }: { active?: boolean; payload?: TooltipEntry[]; granularity: ReportsSalesGranularity }) {
    const bucket = payload?.[0]?.payload;
    if (!active || !bucket) return null;
    return <div className="max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-black/10 bg-[var(--background)] p-3 text-sm shadow-xl dark:border-white/15">
        <p className="font-semibold text-[var(--text-primary)]">ช่วงเวลา {formatReportsTrendBucketLabel(bucket, granularity)}</p>
        <p className="mt-2 text-[var(--text-secondary)]">ยอดขายที่ชำระแล้ว <strong className="text-[var(--text-primary)]">{formatReportsMoney(bucket.paidSales)}</strong></p>
        <p className="mt-1 text-[var(--text-secondary)]">จำนวนออเดอร์ที่ชำระแล้ว <strong className="text-[var(--text-primary)]">{bucket.paidOrderCount.toLocaleString("th-TH")}</strong></p>
    </div>;
}

export default function ReportsSalesTrendChart({ trend, granularity }: { trend: ReportsSalesTrendBucket[]; granularity: ReportsSalesGranularity }) {
    return <div className="h-[280px] min-w-0 w-full md:h-[300px]" aria-label="กราฟแนวโน้มยอดขาย">
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                <defs><linearGradient id="reportsSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35}/><stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02}/></linearGradient></defs>
                <CartesianGrid stroke="var(--text-muted)" strokeOpacity={0.16} vertical={false}/>
                <XAxis dataKey={granularity === "weekly" ? "label" : "start"} tickFormatter={(value: string) => granularity === "weekly" ? value : formatTrendTick(value, granularity)} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={28} interval="preserveStartEnd"/>
                <YAxis tickFormatter={(value: number) => value.toLocaleString("th-TH", { notation: "compact" })} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={58}/>
                <Tooltip content={<SalesTooltip granularity={granularity}/>}/>
                <Area type="monotone" dataKey="paidSales" stroke="var(--accent)" strokeWidth={2.5} fill="url(#reportsSalesFill)" activeDot={{ r: 5, fill: "var(--accent)" }}/>
            </AreaChart>
        </ResponsiveContainer>
    </div>;
}
