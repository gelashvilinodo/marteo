import { Title, AdminSkeleton, Block, SkChart, SkHeader, SkPanel, SkStats } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="5xl">
        <SkHeader title="მიმოხილვა" subtitle="მთელი პლატფორმის მონაცემები · 0000-00-00, თბილისის დროით" />
        <div className="mt-6 flex items-center gap-4 rounded-3xl bg-[#0A244B] p-5 sm:p-6"><Block className="h-12 w-12 rounded-2xl bg-white/10" /><div className="min-w-0"><Block className="h-4 w-40 bg-white/10" /><Block className="mt-2 h-8 w-12 bg-white/10" /></div></div>
        <SkStats count={6} />
        <Title level={2} className="mt-8" size={7} />
        <SkStats count={4} cols="grid-cols-2 lg:grid-cols-4" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"><SkChart title="შემოსავალი თვეების მიხედვით" height="h-40" /><SkPanel title="შეწყვიტეს გადახდა, ბოლო 30 დღე" rows={3} className="rounded-2xl" /></div>
        <Title level={2} className="mt-8" size={3} />
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2"><SkChart title="რეგისტრაციები, ბოლო 30 დღე" /><SkPanel title="ძაბრი: სად იკარგებიან მომხმარებლები" rows={4} className="rounded-2xl" /></div>
    </AdminSkeleton>;
}
