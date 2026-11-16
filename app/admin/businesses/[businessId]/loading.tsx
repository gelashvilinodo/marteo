import { AdminSkeleton, SkBack, SkPanel, SkProfile, SkStats } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="5xl">
        <SkBack />
        <SkProfile />
        <SkStats count={5} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
        <SkPanel title="პაკეტი" rows={2} className="mt-4" />
        <SkPanel title="გადახდები" rows={3} className="mt-4" />
        <SkPanel title="ბარათით გადახდები (საქართველოს ბანკი)" rows={2} className="mt-4" />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><SkPanel title="შიდა შენიშვნები" rows={2} /><SkPanel title="გუნდი" rows={3} /></div>
    </AdminSkeleton>;
}
