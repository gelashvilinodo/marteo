import { AdminSkeleton, SkHeader, SkList, SkPanel } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="6xl">
        <SkHeader title="შეტყობინებები" subtitle="მომხმარებლებისთვის შიდა შეტყობინებების გაგზავნა და დაგეგმვა" action />
        <SkPanel title="შეტყობინებები ამ მოწყობილობაზე" rows={1} className="mt-6 rounded-2xl" />
        <SkPanel title="ავტომატური შეტყობინებები" rows={2} className="mt-6 rounded-2xl" />
        <SkList rows={6} avatar={false} className="mt-6" />
    </AdminSkeleton>;
}
