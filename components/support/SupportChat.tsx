"use client";

import { Icon } from "@iconify/react";
import { createPortal } from "react-dom";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SupportAvatar, { MarteoAvatar } from "./SupportAvatar";
import { playSupportChime } from "./support-sound";
import { useKeyboardViewport } from "./useKeyboardViewport";
import { compressSupportImage } from "./compress-image";
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
    // Shown under the header, e.g. the one-time notification nudge.
    banner?: ReactNode;
    // Extra controls left of the input; `insert` adds text to the draft.
    composerTools?: (insert: (text: string) => void) => ReactNode;
    // Shown as Marteo's first message; never stored.
    welcome?: string;
    business: { name: string; logoUrl: string | null };
    // Plays a chime when the other side writes while this chat is open.
    sound?: boolean;
    self?: { name: string; avatarUrl: string | null };
    onThread?: (thread: SupportThreadView) => void;
};

type Attachment = { blob: Blob; previewUrl: string };

type Pending = { key: string; body: string; image: Attachment | null; createdAt: string; failed: boolean };

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

export default function SupportChat({ viewer, endpoint, header, banner, composerTools, welcome, business, sound = false, self, onThread }: SupportChatProps) {
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
    const [attachment, setAttachment] = useState<Attachment | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [viewing, setViewing] = useState<string | null>(null);

    const known = useRef<Set<string> | null>(null);
    const sending = useRef(0);
    const scroller = useRef<HTMLDivElement>(null);
    const keyboard = useKeyboardViewport();
    const input = useRef<HTMLTextAreaElement>(null);
    const filePicker = useRef<HTMLInputElement>(null);
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

    // Opening the keyboard shrinks the list; keep the newest message in view.
    useLayoutEffect(() => {
        const element = scroller.current;
        if (keyboard.open && element) element.scrollTop = element.scrollHeight;
    }, [keyboard.open, keyboard.height]);

    const onScroll = () => {
        const element = scroller.current;
        if (!element) return;
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        if (nearBottom.current) setShowNewPill(false);
    };

    const insert = (text: string) => {
        setDraft(current => current.trim() ? `${current.trimEnd()} ${text}` : text);
        // Looked up by id: this runs from tools rendered in the composer, not during render.
        requestAnimationFrame(() => {
            const element = document.getElementById(`support-input-${viewer}`) as HTMLTextAreaElement | null;
            if (!element) return;
            element.style.height = "auto";
            element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
            element.focus();
            element.setSelectionRange(element.value.length, element.value.length);
        });
    };

    const resize = () => {
        const element = input.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
    };

    // Picked or pasted photos are shrunk before they are shown or sent.
    const attach = async (file: File) => {
        setError("");
        setPreparing(true);
        try {
            const blob = await compressSupportImage(file);
            setAttachment(current => {
                if (current) URL.revokeObjectURL(current.previewUrl);
                return { blob, previewUrl: URL.createObjectURL(blob) };
            });
            input.current?.focus();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ფოტო ვერ დაემატა.");
        } finally { setPreparing(false); }
    };

    const removeAttachment = () => {
        setAttachment(current => {
            if (current) URL.revokeObjectURL(current.previewUrl);
            return null;
        });
    };

    useEffect(() => {
        if (!viewing) return;
        const close = (event: KeyboardEvent) => { if (event.key === "Escape") setViewing(null); };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [viewing]);

    const deliver = async (item: Pending) => {
        sending.current += 1;
        try {
            let request: RequestInit = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: item.body }),
            };
            if (item.image) {
                const form = new FormData();
                form.append("text", item.body);
                form.append("file", item.image.blob, "photo.jpg");
                request = { method: "POST", body: form };
            }
            const response = await fetch(endpoint, request);
            const data = await response.json().catch(() => ({})) as { thread?: SupportThreadView; message?: string };
            if (!response.ok || !data.thread) throw new Error(data.message || "შეტყობინება ვერ გაიგზავნა.");
            setPending(current => current.filter(entry => entry.key !== item.key));
            if (item.image) URL.revokeObjectURL(item.image.previewUrl);
            apply(data.thread, "send");
        } catch (cause) {
            setPending(current => current.map(entry => entry.key === item.key ? { ...entry, failed: true } : entry));
            setError(cause instanceof Error ? cause.message : "შეტყობინება ვერ გაიგზავნა.");
        } finally { sending.current -= 1; }
    };

    const send = () => {
        const body = draft.trim();
        if ((!body && !attachment) || body.length > SUPPORT_MESSAGE_MAX_LENGTH || preparing) return;
        const item: Pending = { key: `pending-${crypto.randomUUID()}`, body, image: attachment, createdAt: new Date().toISOString(), failed: false };
        setDraft("");
        setAttachment(null);
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

    return <section
        style={keyboard.open ? { position: "fixed", left: 0, right: 0, top: keyboard.top, height: keyboard.height, zIndex: 60, boxShadow: "0 10rem 0 0 var(--marteo-surface)" } : undefined}
        className={`relative flex min-h-0 flex-col overflow-hidden bg-surface ${keyboard.open ? "" : "h-full rounded-3xl border border-border shadow-[0_18px_50px_-30px_rgb(15_28_46/0.45)]"}`}>
        <header
            // ღია კლავიატურისას ჰედერი სტატუს-ბარის ქვეშ არ უნდა მოექცეს, რაც არ უნდა იყოს ხილული არის პოზიცია.
            style={keyboard.open ? { paddingTop: `max(0.75rem, calc(env(safe-area-inset-top) - ${keyboard.top}px + 0.5rem))` } : undefined}
            className="flex shrink-0 items-center gap-3 border-b border-border bg-gradient-to-r from-[#0B2A55] via-[#0A244B] to-[#081F46] px-4 pt-3 pb-3 text-white sm:px-5">
            {header}
        </header>

        {!keyboard.open && banner}

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
                    const imageUrl = row.kind === "message" ? row.message.imageUrl : row.kind === "pending" ? row.pending.image?.previewUrl ?? null : null;

                    return <Fragment key={row.key}>
                        {newDay && <li className="my-3 flex justify-center" aria-hidden="true">
                            <span className="rounded-full border border-border px-3 py-0.5 text-[11px] text-text-secondary">{dayLabel(createdAt)}</span>
                        </li>}
                        <li className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${groupStart ? "mt-3" : "mt-1"} ${animation}`}>
                            <span className={`w-8 shrink-0 ${groupEnd ? "" : "invisible"}`} aria-hidden={!groupEnd}>{groupEnd && avatarFor(row)}</span>
                            <div className={`flex min-w-0 max-w-[82%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
                                {showName && <span className="mb-1 px-1 text-[11px] font-medium text-text-secondary">{row.message.author!.name}</span>}
                                {imageUrl && <button type="button" onClick={() => setViewing(imageUrl)} aria-label="ფოტოს გადიდება"
                                    className={`overflow-hidden rounded-2xl border border-border bg-background ${body ? "mb-1" : ""} ${failed ? "opacity-60" : row.kind === "pending" ? "opacity-80" : ""}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived photo behind an access-checked route */}
                                    <img src={imageUrl} alt="გაგზავნილი ფოტო" loading="lazy"
                                        onLoad={() => { const element = scroller.current; if (element && nearBottom.current) element.scrollTop = element.scrollHeight; }}
                                        className="block max-h-72 w-auto max-w-full object-contain" />
                                </button>}
                                {body && <div className={[
                                    "whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed",
                                    mine
                                        ? `rounded-2xl bg-accent text-white ${groupEnd ? "rounded-br-md" : ""} ${failed ? "bg-danger/80" : ""} ${row.kind === "pending" && !failed ? "opacity-80" : ""}`
                                        : `rounded-2xl border border-border bg-background text-text-primary ${groupEnd ? "rounded-bl-md" : ""}`,
                                ].join(" ")}>
                                    {body}
                                </div>}
                                {groupEnd && <span className="mt-1 flex items-center gap-1 px-1 text-[10px] text-text-secondary">
                                    {formatSupportTime(createdAt)}
                                    {row.kind === "pending" && !failed && <><span aria-hidden="true">·</span> იგზავნება…</>}
                                    {failed && <button type="button" onClick={() => retry(row.pending)} className="font-medium text-danger underline-offset-2 hover:underline">· ვერ გაიგზავნა, სცადეთ ხელახლა</button>}
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

        <footer className={`shrink-0 border-t border-border bg-surface px-3 pt-3 sm:px-4 ${keyboard.open ? "pb-1.5" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"}`}>
            {viewer === "USER" && thread?.status === "CLOSED" && <p className="mb-2 rounded-xl bg-background px-3 py-2 text-xs text-text-secondary">საუბარი დასრულებულია. ახალი შეტყობინება მას ხელახლა გახსნის.</p>}
            {loadError && <p className="mb-2 text-xs text-warning">კავშირი შეფერხდა - ვცდილობთ ხელახლა…</p>}
            {error && <p role="alert" className="mb-2 text-xs text-danger">{error}</p>}
            {(attachment || preparing) && <div className="mb-2 flex items-center gap-2">
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-border bg-background">
                    {attachment
                        // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo about to be sent
                        ? <img src={attachment.previewUrl} alt="ასატვირთი ფოტო" className="h-full w-full object-cover" />
                        : <span className="flex h-full w-full items-center justify-center"><Icon icon="svg-spinners:180-ring" className="h-5 w-5 text-text-secondary" aria-hidden="true" /></span>}
                    {attachment && <button type="button" onClick={removeAttachment} aria-label="ფოტოს მოშორება"
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                        <Icon icon="solar:close-circle-linear" className="h-4 w-4" aria-hidden="true" />
                    </button>}
                </div>
                <span className="text-xs text-text-secondary">{preparing ? "ფოტო მზადდება…" : "ფოტო გაიგზავნება შეტყობინებასთან ერთად"}</span>
            </div>}
            <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); send(); }}>
                {composerTools?.(insert)}
                <input ref={filePicker} type="file" accept="image/*" className="hidden" tabIndex={-1}
                    onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void attach(file); }} />
                <button type="button" onClick={() => filePicker.current?.click()} disabled={preparing} aria-label="ფოტოს დამატება" title="ფოტოს დამატება"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:bg-background hover:text-accent disabled:opacity-40">
                    <Icon icon="solar:gallery-add-linear" className="h-6 w-6" aria-hidden="true" />
                </button>
                <label className="sr-only" htmlFor={`support-input-${viewer}`}>შეტყობინება</label>
                <textarea
                    id={`support-input-${viewer}`}
                    ref={input}
                    rows={1}
                    value={draft}
                    maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                    placeholder="დაწერეთ შეტყობინება…"
                    onChange={event => { setDraft(event.target.value); resize(); }}
                    onPaste={event => {
                        // A copied screenshot attaches straight from the clipboard.
                        const file = Array.from(event.clipboardData.files).find(item => item.type.startsWith("image/"));
                        if (file) { event.preventDefault(); void attach(file); }
                    }}
                    onKeyDown={event => {
                        const touch = window.matchMedia("(pointer: coarse)").matches;
                        if (event.key === "Enter" && !event.shiftKey && !touch && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            send();
                        }
                    }}
                    className="max-h-[140px] min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-base text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                    type="submit"
                    disabled={(!draft.trim() && !attachment) || preparing}
                    aria-label="გაგზავნა"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/30 transition hover:bg-accent-hover active:scale-90 disabled:scale-95 disabled:opacity-40 disabled:shadow-none"
                >
                    <Icon icon="solar:plain-2-bold" className="h-5 w-5" aria-hidden="true" />
                </button>
            </form>
            {draft.length > SUPPORT_MESSAGE_MAX_LENGTH - 200 && <p className="mt-1 text-right text-[10px] text-text-secondary">{draft.length}/{SUPPORT_MESSAGE_MAX_LENGTH}</p>}
        </footer>

        {/* Portaled so the chat's own layout never clips the full-screen view. */}
        {viewing && createPortal(<div role="dialog" aria-modal="true" aria-label="ფოტო" onClick={() => setViewing(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
            <button type="button" onClick={() => setViewing(null)} aria-label="დახურვა"
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
                <Icon icon="solar:close-circle-linear" className="h-6 w-6" aria-hidden="true" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- full-size view of a chat photo */}
            <img src={viewing} alt="ფოტო" onClick={event => event.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>, document.body)}
    </section>;
}
