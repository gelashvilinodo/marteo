"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import ProductThumbnail from "@/components/shared/ProductThumbnail";
import { NOTIFICATIONS_SEEN } from "@/lib/notifications/events";
import PushCard from "@/components/support/PushCard";


type NotificationItem = {
    id: string; kind: string; title: string; body: string;
    actionLabel: string | null; actionUrl: string | null; imageUrl: string | null;
    deliverAt: string; readAt: string | null;
};

const timeFormat = new Intl.DateTimeFormat("ka-GE", { timeZone: "Asia/Tbilisi", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Avatar({ item }: { item: NotificationItem }) {
    if (item.kind === "LOW_STOCK" || item.kind === "OUT_OF_STOCK" || item.kind === "STOCK_SUMMARY") {
        const out = item.kind === "OUT_OF_STOCK";
        return <div className="relative h-12 w-12 shrink-0">
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                {item.imageUrl
                    ? <ProductThumbnail src={item.imageUrl} alt="" fill sizes="48px" className="object-contain p-0.5" />
                    : <Icon icon="solar:box-bold-duotone" className="h-6 w-6 text-text-secondary" />}
            </div>
            <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-surface ${out ? "bg-danger" : "bg-warning"}`}>
                <Icon icon={out ? "solar:close-circle-bold" : "solar:danger-triangle-bold"} className="h-3 w-3 text-white" />
            </span>
        </div>;
    }
    // Everything else is sent by MARTEO itself. The logo's own square covers ~2/3 of the SVG,
    // so it is scaled up to fill the avatar over a background of the same colour.
    return <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0B1928] dark:bg-white">
        <Image src="/images/marteo-11.svg" alt="MARTEO" width={48} height={48} className="h-full w-full scale-[1.56] object-contain dark:hidden" />
        <Image src="/images/marteo-12.svg" alt="MARTEO" width={48} height={48} className="hidden h-full w-full scale-[1.56] object-contain dark:block" />
    </div>;
}

export default function NotificationsView({ notifications: initial, pushKey }: { notifications: NotificationItem[]; pushKey: string | null }) {
    const [notifications, setNotifications] = useState(initial);
    const [error, setError] = useState("");
    // The server marked these seen while rendering; clear the header dot right away.
    useEffect(() => { window.dispatchEvent(new Event(NOTIFICATIONS_SEEN)); }, []);

    // Removes right away; puts the items back if the server refuses.
    async function remove(id: string | null) {
        const before = notifications;
        setNotifications(id === null ? [] : before.filter(n => n.id !== id));
        setError("");
        const response = await fetch(id === null ? "/api/notifications" : `/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" }).catch(() => null);
        if (!response?.ok) {
            setNotifications(before);
            setError("შეტყობინება ვერ წაიშალა. სცადე თავიდან.");
        }
    }

    return <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-text-primary">შეტყობინებები</h1>
                    <p className="mt-2 text-sm text-text-secondary">მართეოს სიახლეები და შენი ბიზნესის მნიშვნელოვანი მოვლენები</p>
                </div>
                {notifications.length > 0 && <button type="button" onClick={() => remove(null)} className="delete-action inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition">
                    <Icon icon="solar:trash-bin-trash-linear" className="h-5 w-5" />ყველას წაშლა
                </button>}
            </div>
            <PushCard publicKey={pushKey} description="ჩართე და დახმარების პასუხი ტელეფონზე ან კომპიუტერზე მოგივა, მაშინაც, თუ MARTEO დახურულია." />
            {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

            {notifications.length === 0 ? <section className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Icon icon="solar:bell-bold-duotone" className="h-6 w-6" /></span>
                <h2 className="mt-4 text-base font-semibold text-text-primary">შეტყობინებები ჯერ არ გაქვს</h2>
                <p className="mt-2 max-w-md text-sm text-text-secondary">როცა რამე მნიშვნელოვანი მოხდება, აქ გამოჩნდება.</p>
            </section> : <ul className="mt-6 space-y-3">
                {notifications.map(item => {
                    const unread = !item.readAt;
                    return <li key={item.id} className={`flex gap-4 rounded-2xl border p-4 ${unread ? "border-accent/40 bg-accent/5" : "border-border bg-surface"}`}>
                        <Avatar item={item} />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="text-sm font-semibold text-text-primary">{item.title}</h2>
                                <div className="flex shrink-0 items-center gap-2">
                                    {unread && <span className="h-2 w-2 rounded-full bg-accent" aria-label="ახალი" />}
                                    <button type="button" onClick={() => remove(item.id)} aria-label="წაშლა" title="წაშლა" className="delete-action flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition">
                                        <Icon icon="solar:trash-bin-trash-linear" className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-text-secondary">{item.body}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <time dateTime={item.deliverAt} className="text-xs text-text-secondary">{timeFormat.format(new Date(item.deliverAt))}</time>
                                {item.actionUrl && <Link href={item.actionUrl} prefetch={false} className="rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">{item.actionLabel || "ნახვა"}</Link>}
                            </div>
                        </div>
                    </li>;
                })}
            </ul>}
        </div>
    </main>;
}
