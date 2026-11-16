import { AdminSkeleton, Block, SkBack, SkPanel, SkProfile } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="4xl">
        <SkBack />
        <SkProfile />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"><SkPanel title="კონტაქტი და დადასტურება" rows={4} /><SkPanel title="აქტივობა" rows={3} /></div>
        <SkPanel title="მოქმედებები" className="mt-4"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map(index => <Block key={index} className="h-11 rounded-xl" />)}</div></SkPanel>
        <SkPanel title="ბიზნესები" rows={2} className="mt-4" />
        <SkPanel title="ელფოსტები" rows={3} className="mt-4" />
    </AdminSkeleton>;
}
