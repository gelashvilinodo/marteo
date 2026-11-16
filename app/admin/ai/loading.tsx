import { AdminSkeleton, SkChart, SkHeader, SkPanel, SkStats } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="5xl">
        <SkHeader title="მართეო AI" subtitle="ხარჯი და გამოყენება ამ თვეში (თბილისის დროით)." />
        <SkStats count={4} cols="grid-cols-2 lg:grid-cols-4" />
        <div className="mt-4"><SkChart title="ხარჯი დღეების მიხედვით, ბოლო 30 დღე" /></div>
        <SkPanel title="ყველაზე მეტად იყენებენ ამ თვეში" rows={5} className="mt-4" />
    </AdminSkeleton>;
}
