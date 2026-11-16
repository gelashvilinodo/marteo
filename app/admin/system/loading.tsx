import { AdminSkeleton, SkHeader, SkPanel, Text } from "@/components/admin/AdminSkeleton";

export default function Loading() {
    return <AdminSkeleton width="5xl">
        <SkHeader title="სისტემა" subtitle="შეცდომები, საათობრივი სამუშაოები და ბანერი." action />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="min-w-0 rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs"><Text>მუშაობს</Text></p><p className="mt-2 text-sm font-semibold"><Text>საათობრივი სამუშაოს სახელი</Text></p><p className="mt-1 text-xs"><Text>ბოლოს: 00.00, 00:00</Text></p>
        </div>)}</div>
        <SkPanel title="შეცდომები" rows={5} className="mt-4 rounded-2xl" />
        <SkPanel title="ბანერი დაშბორდზე" rows={1} className="mt-4" />
    </AdminSkeleton>;
}
