"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SupportAvatar from "@/components/support/SupportAvatar";
import PushToggle from "@/components/support/PushToggle";
import { playSupportChime, setSupportSound, useSupportSound } from "@/components/support/support-sound";
import type { AdminConversationRow } from "@/lib/support/support-chat";
import { formatSupportTime } from "@/lib/support/support-config";

type Data = { conversations: AdminConversationRow[]; unreadTotal: number };
type Filter = "ALL" | "UNREAD" | "OPEN" | "CLOSED";

const filters: { value: Filter; label: string }[] = [
    { value: "ALL", label: "ყველა" },
    { value: "UNREAD", label: "წაუკითხავი" },
    { value: "OPEN", label: "ღია" },
    { value: "CLOSED", label: "დახურული" },
];

function ago(iso: string) {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "ახლა";
    if (minutes < 60) return `${minutes} წთ`;
    return formatSupportTime(iso);
}

export default function AdminSupportInbox({ initial, pushKey }: { initial: Data; pushKey: string | null }) {
    const [data, setData] = useState(initial);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [query, setQuery] = useState("");
    const [, setNow] = useState(0);
    const seen = useRef(new Map(initial.conversations.map(row => [row.id, row.lastMessageAt])));
    const [fresh, setFresh] = useState<Set<string>>(new Set());
    const soundOn = useSupportSound();
    const unreadTotal = useRef(initial.unreadTotal);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => {
            if (!document.hidden) {
                try {
                    const response = await fetch("/api/admin/support/conversations", { cache: "no-store" });
                    if (response.ok && !stopped) {
                        const next = await response.json() as Data;
                        const changed = new Set(next.conversations
                            .filter(row => seen.current.get(row.id) !== row.lastMessageAt)
                            .map(row => row.id));
                        seen.current = new Map(next.conversations.map(row => [row.id, row.lastMessageAt]));
                        setFresh(changed);
                        if (next.unreadTotal > unreadTotal.current) playSupportChime();
                        unreadTotal.current = next.unreadTotal;
                        setData(next);
                        setNow(Date.now());
                    }
                } catch { /* Next tick retries. */ }
            }
            if (!stopped) timer = setTimeout(tick, 4000);
        };
        timer = setTimeout(tick, 4000);
        return () => { stopped = true; clearTimeout(timer); };
    }, []);

    const rows = useMemo(() => data.conversations.filter(row => {
        if (filter === "UNREAD" && !row.unread) return false;
        if ((filter === "OPEN" || filter === "CLOSED") && row.status !== filter) return false;
        return !query.trim() || row.business.name.toLowerCase().includes(query.trim().toLowerCase());
    }), [data, filter, query]);

    const count = (value: Filter) => data.conversations.filter(row =>
        value === "ALL" ? true : value === "UNREAD" ? row.unread > 0 : row.status === value).length;

    return <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">დახმარება</h1>
                <p className="mt-1 text-sm text-text-secondary">
                    {data.unreadTotal ? `${data.unreadTotal} წაუკითხავი შეტყობინება` : "ყველა შეტყობინება წაკითხულია"} · ისტორია ინახება 24 საათი
                </p>
            </div>
            <div className="flex w-full items-start gap-2 sm:w-auto">
                <button type="button" onClick={() => { setSupportSound(!soundOn); if (!soundOn) playSupportChime(); }}
                    aria-pressed={soundOn} aria-label={soundOn ? "ხმის გამორთვა" : "ხმის ჩართვა"} title={soundOn ? "ახალ შეტყობინებაზე ხმა ჩართულია" : "ხმა გამორთულია"}
                    className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-border bg-surface transition hover:bg-background ${soundOn ? "text-accent" : "text-text-secondary"}`}>
                    <Icon icon={soundOn ? "solar:volume-loud-bold-duotone" : "solar:volume-cross-linear"} className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1 sm:w-72 sm:flex-none"><PushToggle publicKey={pushKey} tone="light" /></div>
            </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex gap-1 overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border border-border bg-surface p-1">
                {filters.map(item => <button key={item.value} type="button" onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition ${filter === item.value ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}>
                    {item.label}
                    <span className={`rounded-full px-1.5 text-[11px] ${filter === item.value ? "bg-white/20" : "bg-background"}`}>{count(item.value)}</span>
                </button>)}
            </div>
            <label className="relative flex-1">
                <span className="sr-only">ბიზნესის ძებნა</span>
                <Icon icon="solar:magnifer-linear" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ბიზნესის ძებნა"
                    className="h-10 w-full rounded-2xl border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none focus:border-accent" />
            </label>
        </div>

        <ul className="mt-4 overflow-hidden rounded-3xl border border-border bg-surface">
            {!rows.length && <li className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-text-secondary">
                <Icon icon="solar:inbox-line-linear" className="h-9 w-9" aria-hidden="true" />
                {data.conversations.length ? "ამ ფილტრით მიმოწერა არ მოიძებნა" : "ბოლო 24 საათში მიმოწერა არ ყოფილა"}
            </li>}
            {rows.map(row => <li key={row.id} className={`border-b border-border last:border-0 ${fresh.has(row.id) ? "support-message-in" : ""}`}>
                <Link href={`/admin/support/${row.id}`} prefetch={false} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-background sm:px-5">
                    <span className="relative">
                        <SupportAvatar name={row.business.name} imageUrl={row.business.logoUrl} size="md" />
                        {row.status === "OPEN" && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                            <span className={`truncate text-sm ${row.unread ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}>{row.business.name}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${row.status === "OPEN" ? "bg-success/15 text-success" : "bg-background text-text-secondary"}`}>
                                {row.status === "OPEN" ? "ღია" : "დახურული"}
                            </span>
                        </span>
                        <span className={`mt-0.5 block truncate text-[13px] ${row.unread ? "text-text-primary" : "text-text-secondary"}`}>
                            {row.lastMessage?.sender === "ADMIN" && <span className="text-text-secondary">შენ: </span>}
                            {row.lastMessage?.body}
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-[11px] text-text-secondary" suppressHydrationWarning>{ago(row.lastMessageAt)}</span>
                        {row.unread > 0
                            ? <span key={row.unread} className="support-badge-pop min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{row.unread}</span>
                            : <Icon icon="solar:alt-arrow-right-linear" className="h-4 w-4 text-text-secondary" aria-hidden="true" />}
                    </span>
                </Link>
            </li>)}
        </ul>
    </div>;
}
