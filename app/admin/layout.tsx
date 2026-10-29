import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/authorization";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    if (!await getAdminUser()) notFound();
    return <div className="min-h-screen bg-background lg:flex">
        <aside className="border-b border-white/10 bg-[#081F46] p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r">
            <Image src="/images/logo.svg" alt="MARTEO" width={200} height={60} className="h-16 w-auto" />
            <p className="mb-6 text-xs text-slate-300">ადმინ პანელი</p>
            <nav aria-label="ადმინ პანელი"><Link href="/admin" prefetch={false} aria-current="page" className="block rounded-xl bg-white/10 px-4 py-3 text-sm">მიმოხილვა</Link></nav>
            <Link href="/dashboard" prefetch={false} className="mt-6 block px-4 py-3 text-sm text-slate-300 hover:text-white">ბიზნესში დაბრუნება</Link>
        </aside>
        <main className="min-w-0 flex-1 p-5 sm:p-8">{children}</main>
    </div>;
}
