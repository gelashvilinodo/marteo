"use client";

import { Icon } from "@iconify/react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SupportAvatar, { MarteoAvatar } from "./SupportAvatar";
import { playSupportChime } from "./support-sound";
import {
    SUPPORT_MESSAGE_MAX_LENGTH,
    SUPPORT_POLL_MS,
    formatSupportTime,
    type SupportMessageView,
    type SupportThreadView,
} from "@/lib/support/support-config";

type Viewer = "USER" | "ADMIN";

type SupportChatProps = {
    viewer: Viewer;
    endpoint: string;
    header: ReactNode;
    // Shown as Marteo's first message; never stored.
    welcome?: string;
    business: { name: string; logoUrl: string | null };
    // Plays a chime when the other side writes while this chat is open.
    sound?: boolean;
    self?: { name: string; avatarUrl: string | null };
    onThread?: (thread: SupportThreadView) => void;
};

type Pending = { key: string; body: string; createdAt: string; failed: boolean };

type Row =
    | { kind: "message"; key: string; message: SupportMessageView; animate: "in" | "out" | null }
    | { kind: "pending"; key: string; pending: Pending }
    | { kind: "welcome"; key: string; body: string; createdAt: string };

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" });

function dayLabel(iso: string) {
    const day = dayFormat.format(new Date(iso));
    if (day === dayFormat.format(new Date())) return "დღეს";
    if (day === dayFormat.format(new Date(Date.now() - 86400000))) return "გუშინ";
    return day;
}

export default function SupportChat({ viewer, endpoint, header, welcome, business, sound = false, self, onThread }: SupportChatProps) {
    const [thread, setThread] = useState<SupportThreadView | null>(null);
    const [pending, setPending] = useState<Pending[]>([]);
    const [animated, setAnimated] = useState<Record<string, "in" | "out">>({});
    const [loadError, setLoadError] = useState(false);
    // The greeting animates only for a first conversation; with history it is just there.
    const [welcomeMode, setWelcomeMode] = useState<"waiting" | "typing" | "animate" | "static">("waiting");
    const [openedAt] = useState(() => new Date().toISOString());
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [showNewPill, setShowNewPill] = useState(false);

    const known = useRef<Set<string> | null>(null);
    const sending = useRef(0);
    const scroller = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const nearBottom = useRef(true);
    const forceScroll = useRef(false);
    const onThreadRef = useRef(onThread);
    useEffect(() => { onThreadRef.current = onThread; }, [onThread]);

    const apply = useCallback((next: SupportThreadView, source: "poll" | "send") => {
        const previous = known.current;
        const fresh = previous ? next.messages.filter(message => !previous.has(message.id)) : [];
        known.current = new Set(next.messages.map(message => message.id));
        if (!previous) setWelcomeMode(next.messages.length ? "static" : "typing");
        if (fresh.length) {
            setAnimated(current => {
                const result = { ...current };
                // The sent bubble already animated while pending; its stored copy appears in place.
                for (const message of fresh) if (source === "poll") result[message.id] = message.sender === viewer ? "out" : "in";
                return result;
            });
            if (source === "poll" && fresh.some(message => message.sender !== viewer)) {
                if (sound) playSupportChime();
                if (nearBottom.current) forceScroll.current = true;
                else setShowNewPill(true);
            }
        }
        setThread(next);
        onThreadRef.current?.(next);
    }, [sound, viewer]);

    const load = useCallback(async (signal?: AbortSignal) => {
        const response = await fetch(endpoint, { cache: "no-store", signal });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json() as { thread: SupportThreadView };
        // A poll that races a send could show the message twice; the send result wins.
        if (sending.current === 0) apply(data.thread, "poll");
    }, [apply, endpoint]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        const tick = async () => {
            if (stopped) return;
            if (!document.hidden) {
                try { await load(controller.signal); setLoadError(false); }
                catch { if (!stopped) setLoadError(true); }
            }
            if (!stopped) timer = setTimeout(tick, SUPPORT_POLL_MS);
        };
        tick();
        const wake = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
        document.addEventListener("visibilitychange", wake);
        return () => {
            stopped = true;
            clearTimeout(timer);
            controller.abort();
            document.removeEventListener("visibilitychange", wake);
        };
    }, [load]);

    useEffect(() => {
        if (welcomeMode !== "typing") return;
        const timer = setTimeout(() => { setWelcomeMode("animate"); forceScroll.current = true; }, 1100);
        return () => clearTimeout(timer);
    }, [welcomeMode]);

    const rows = useMemo<Row[]>(() => {
        const list: Row[] = [];
        // The greeting always opens the thread, so it never looks newer than what follows.
        const first = thread?.messages[0]?.createdAt;
        if (welcome && (welcomeMode === "animate" || welcomeMode === "static")) list.push({ kind: "welcome", key: "welcome", body: welcome, createdAt: first && first < openedAt ? first : openedAt });
        for (const message of thread?.messages ?? []) {
            list.push({ kind: "message", key: message.id, message, animate: animated[message.id] ?? null });
        }
        for (const item of pending) list.push({ kind: "pending", key: item.key, pending: item });
        return list;
    }, [animated, openedAt, pending, thread, welcome, welcomeMode]);

    useLayoutEffect(() => {
        const element = scroller.current;
        if (!element || !forceScroll.current) return;
        forceScroll.current = false;
        element.scrollTo({ top: element.scrollHeight, behavior: known.current && rows.length > 1 ? "smooth" : "auto" });
    }, [rows]);

    // The first load lands at the newest message.
    const firstLoad = useRef(true);
    useEffect(() => {
        if (thread && firstLoad.current) {
            firstLoad.current = false;
            const element = scroller.current;
            if (element) element.scrollTop = element.scrollHeight;
        }
    }, [thread]);

    const onScroll = () => {
        const element = scroller.current;
        if (!element) return;
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        if (nearBottom.current) setShowNewPill(false);
    };

    const resize = () => {
        const element = input.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
    };

    const deliver = async (item: Pending) => {
        sending.current += 1;
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: item.body }),
            });
            const data = await response.json().catch(() => ({})) as { thread?: SupportThreadView; message?: string };
            if (!response.ok || !data.thread) throw new Error(data.message || "შეტყობინება ვერ გაიგზავნა.");
            setPending(current => current.filter(entry => entry.key !== item.key));
            apply(data.thread, "send");
        } catch (cause) {
            setPending(current => current.map(entry => entry.key === item.key ? { ...entry, failed: true } : entry));
            setError(cause instanceof Error ? cause.message : "შეტყობინება ვერ გაიგზავნა.");
        } finally { sending.current -= 1; }
    };

    const send = () => {
        const body = draft.trim();
        if (!body || body.length > SUPPORT_MESSAGE_MAX_LENGTH) return;
        const item: Pending = { key: `pending-${crypto.randomUUID()}`, body, createdAt: new Date().toISOString(), failed: false };
        setDraft("");
        setError("");
        setPending(current => [...current, item]);
        forceScroll.current = true;
        requestAnimationFrame(() => { resize(); input.current?.focus(); });
        void deliver(item);
    };

    const retry = (item: Pending) => {
        setError("");
        setPending(current => current.map(entry => entry.key === item.key ? { ...entry, failed: false } : entry));
        void deliver({ ...item, failed: false });
    };

    const lastMine = [...(thread?.messages ?? [])].reverse().find(message => message.sender === viewer);
    const otherReadAt = viewer === "USER" ? thread?.adminReadAt : thread?.userReadAt;
    const lastMineSeen = Boolean(lastMine && otherReadAt && otherReadAt >= lastMine.createdAt);

    const authorOf = (row: Row) => {
        if (row.kind === "welcome") return { sender: "ADMIN" as const, key: "ADMIN" };
        if (row.kind === "pending") return { sender: viewer, key: `${viewer}:self` };
        const { message } = row;
        if (message.sender === "ADMIN") return { sender: "ADMIN" as const, key: "ADMIN" };
        return { sender: "USER" as const, key: `USER:${message.author?.name ?? ""}` };
    };

    const avatarFor = (row: Row) => {
        const { sender } = authorOf(row);
        if (sender === "ADMIN") return <MarteoAvatar />;
        if (row.kind === "pending" || (row.kind === "message" && !row.message.author)) {
            return <SupportAvatar name={self?.name ?? business.name} imageUrl={self?.avatarUrl ?? business.logoUrl} />;
        }
        const author = row.kind === "message" ? row.message.author! : null;
        return <SupportAvatar name={author?.name ?? business.name} imageUrl={author?.avatarUrl ?? business.logoUrl} />;
    };

    const createdAtOf = (row: Row) => row.kind === "message" ? row.message.createdAt : row.kind === "pending" ? row.pending.createdAt : row.createdAt;

    return <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_18px_50px_-30px_rgb(15_28_46/0.45)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-gradient-to-r from-[#0B2A55] via-[#0A244B] to-[#081F46] px-4 py-3 text-white sm:px-5">
            {header}
        </header>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions">
            <p className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full bg-background px-3 py-1 text-[11px] text-text-secondary">
                <Icon icon="solar:clock-circle-linear" className="h-3.5 w-3.5" aria-hidden="true" />
                შეტყობინებები ავტომატურად იშლება 24 საათში
            </p>

            {!thread && !loadError && <div className="flex h-40 items-center justify-center text-sm text-text-secondary">იტვირთება…</div>}
            {thread && !rows.length && !welcome && <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-text-secondary">
                <Icon icon="solar:chat-round-dots-linear" className="h-8 w-8" aria-hidden="true" />
                შეტყობინებები ჯერ არ არის
            </div>}

            <ol className="flex flex-col">
                {rows.map((row, index) => {
                    const author = authorOf(row);
                    const mine = author.sender === viewer;
                    const next = rows[index + 1];
                    const previous = rows[index - 1];
                    const createdAt = createdAtOf(row);
                    const groupEnd = !next || authorOf(next).key !== author.key
                        || new Date(createdAtOf(next)).getTime() - new Date(createdAt).getTime() > 5 * 60000;
                    const groupStart = !previous || authorOf(previous).key !== author.key
                        || new Date(createdAt).getTime() - new Date(createdAtOf(previous)).getTime() > 5 * 60000;
                    const newDay = !previous || dayLabel(createdAtOf(previous)) !== dayLabel(createdAt);
                    const body = row.kind === "message" ? row.message.body : row.kind === "pending" ? row.pending.body : row.body;
                    const animation = row.kind === "welcome" ? (welcomeMode === "animate" ? "support-message-in" : "")
                        : row.kind === "pending" ? "support-message-out"
                            : row.animate === "in" ? "support-message-in" : row.animate === "out" ? "support-message-out" : "";
                    const showName = viewer === "ADMIN" && !mine && groupStart && row.kind === "message" && row.message.author;
                    const failed = row.kind === "pending" && row.pending.failed;

                    return <Fragment key={row.key}>
                        {newDay && <li className="my-3 flex justify-center" aria-hidden="true">
                            <span className="rounded-full border border-border px-3 py-0.5 text-[11px] text-text-secondary">{dayLabel(createdAt)}</span>
                        </li>}
                        <li className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${groupStart ? "mt-3" : "mt-1"} ${animation}`}>
                            <span className={`w-8 shrink-0 ${groupEnd ? "" : "invisible"}`} aria-hidden={!groupEnd}>{groupEnd && avatarFor(row)}</span>
                            <div className={`flex min-w-0 max-w-[82%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
                                {showName && <span className="mb-1 px-1 text-[11px] font-medium text-text-secondary">{row.message.author!.name}</span>}
                                <div className={[
                                    "whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed",
                                    mine
                                        ? `rounded-2xl bg-accent text-white ${groupEnd ? "rounded-br-md" : ""} ${failed ? "bg-danger/80" : ""} ${row.kind === "pending" && !failed ? "opacity-80" : ""}`
                                        : `rounded-2xl border border-border bg-background text-text-primary ${groupEnd ? "rounded-bl-md" : ""}`,
                                ].join(" ")}>
                                    {body}
                                </div>
                                {groupEnd && <span className="mt-1 flex items-center gap-1 px-1 text-[10px] text-text-secondary">
                                    {formatSupportTime(createdAt)}
                                    {row.kind === "pending" && !failed && <><span aria-hidden="true">·</span> იგზავნება…</>}
                                    {failed && <button type="button" onClick={() => retry(row.pending)} className="font-medium text-danger underline-offset-2 hover:underline">· ვერ გაიგზავნა, სცადე ხელახლა</button>}
                                    {row.kind === "message" && row.message.id === lastMine?.id && !pending.length && <>
                                        <span aria-hidden="true">·</span>
                                        <Icon icon={lastMineSeen ? "solar:check-read-linear" : "solar:check-circle-linear"} className={`h-3.5 w-3.5 ${lastMineSeen ? "text-accent" : ""}`} aria-hidden="true" />
                                        {lastMineSeen ? "ნანახია" : "გაგზავნილია"}
                                    </>}
                                </span>}
                            </div>
                        </li>
                    </Fragment>;
                })}
                {welcomeMode === "typing" && <li className="support-message-in mt-3 flex items-end gap-2" aria-label="MARTEO წერს">
                    <MarteoAvatar />
                    <span className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-background px-4 py-3">
                        {[0, 1, 2].map(dot => <span key={dot} className="support-typing-dot h-1.5 w-1.5 rounded-full bg-text-secondary" />)}
                    </span>
                </li>}
            </ol>
        </div>

        {showNewPill && <button type="button" onClick={() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); setShowNewPill(false); }}
            className="support-new-pill absolute bottom-24 left-1/2 flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white shadow-lg">
            <Icon icon="solar:arrow-down-linear" className="h-3.5 w-3.5" aria-hidden="true" /> ახალი შეტყობინება
        </button>}

        <footer className="shrink-0 border-t border-border bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
            {viewer === "USER" && thread?.status === "CLOSED" && <p className="mb-2 rounded-xl bg-background px-3 py-2 text-xs text-text-secondary">საუბარი დასრულებულია. ახალი შეტყობინება მას ხელახლა გახსნის.</p>}
            {loadError && <p className="mb-2 text-xs text-warning">კავშირი შეფერხდა — ვცდილობთ ხელახლა…</p>}
            {error && <p role="alert" className="mb-2 text-xs text-danger">{error}</p>}
            <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); send(); }}>
                <label className="sr-only" htmlFor={`support-input-${viewer}`}>შეტყობინება</label>
                <textarea
                    id={`support-input-${viewer}`}
                    ref={input}
                    rows={1}
                    value={draft}
                    maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                    placeholder="დაწერე შეტყობინება…"
                    onChange={event => { setDraft(event.target.value); resize(); }}
                    onKeyDown={event => {
                        const touch = window.matchMedia("(pointer: coarse)").matches;
                        if (event.key === "Enter" && !event.shiftKey && !touch && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            send();
                        }
                    }}
                    className="max-h-[140px] min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="გაგზავნა"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/30 transition hover:bg-accent-hover active:scale-90 disabled:scale-95 disabled:opacity-40 disabled:shadow-none"
                >
                    <Icon icon="solar:plain-2-bold" className="h-5 w-5" aria-hidden="true" />
                </button>
            </form>
            {draft.length > SUPPORT_MESSAGE_MAX_LENGTH - 200 && <p className="mt-1 text-right text-[10px] text-text-secondary">{draft.length}/{SUPPORT_MESSAGE_MAX_LENGTH}</p>}
        </footer>
    </section>;
}
