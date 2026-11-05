"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import type { AiConversationSummary } from "@/lib/ai/ai-conversations-client";

const DAY = 86_400_000;

// თბილისის დროით: დღეს — საათი, გუშინ — „გუშინ“, სხვა — თარიღი.
function when(value: string) {
    const local = (time: number) => new Date(time + 4 * 60 * 60 * 1000);
    const date = local(Date.parse(value));
    const today = local(Date.now());
    const key = (day: Date) => day.toISOString().slice(0, 10);
    const pad = (part: number) => String(part).padStart(2, "0");

    if (key(date) === key(today)) return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    if (key(date) === key(new Date(today.getTime() - DAY))) return "გუშინ";
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`;
}

export default function AiHistoryList({ history, activeId, loading, error, onOpen, onDelete, onNew }: {
    history: AiConversationSummary[] | null;
    activeId: string | null;
    loading: boolean;
    error: string;
    onOpen: (id: string) => void;
    onDelete: (id: string) => Promise<void>;
    onNew: () => void;
}) {
    const [confirming, setConfirming] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    async function remove(id: string) {
        setDeleting(id);
        await onDelete(id);
        setDeleting(null);
        setConfirming(null);
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border p-3">
                <p className="mb-2.5 flex items-start gap-2 rounded-xl bg-accent/5 px-3 py-2 text-[11px] leading-snug text-text-secondary ring-1 ring-inset ring-accent/15">
                    <Icon icon="solar:info-circle-linear" className="mt-px h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    მართეო AI შეიძლება შეცდეს — მნიშვნელოვანი ინფორმაცია გადაამოწმეთ.
                </p>

                <button
                    type="button"
                    onClick={onNew}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-white transition hover:bg-accent-hover"
                >
                    <Icon icon="solar:pen-new-square-linear" className="h-[18px] w-[18px]" aria-hidden="true" />
                    ახალი ჩათი
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-text-secondary">ბოლო 30 დღის ჩათები</p>
                {error && <p role="alert" className="px-2 py-1 text-xs text-danger">{error}</p>}

                {history === null ? (
                    <div role="status" aria-label="ჩათები იტვირთება" className="animate-pulse space-y-2 p-2">
                        <div className="h-12 rounded-xl bg-background" />
                        <div className="h-12 rounded-xl bg-background" />
                    </div>
                ) : (
                    <ul className="flex flex-col gap-0.5" aria-busy={loading}>
                        {history.map((item) => {
                            const label = item.title || item.preview || "ახალი ჩათი";

                            return (
                                <li key={item.id} className="group relative">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(item.id)}
                                        disabled={loading}
                                        aria-current={item.id === activeId ? "true" : undefined}
                                        className={[
                                            "flex w-full min-w-0 items-center gap-3 rounded-xl py-2.5 pl-3 pr-12 text-left transition",
                                            item.id === activeId ? "bg-accent/10" : "hover:bg-background",
                                        ].join(" ")}
                                    >
                                        <Icon icon="solar:chat-round-line-linear" className="h-[18px] w-[18px] shrink-0 text-text-secondary" aria-hidden="true" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-text-primary">{label}</span>
                                            <span className="block text-[11px] text-text-secondary">{when(item.updatedAt)}</span>
                                        </span>
                                    </button>

                                    {confirming === item.id ? (
                                        <div className="absolute inset-y-1 right-1 flex items-center gap-1 rounded-lg bg-surface pl-2 shadow-sm ring-1 ring-border">
                                            <button
                                                type="button"
                                                onClick={() => void remove(item.id)}
                                                disabled={deleting === item.id}
                                                className="h-8 rounded-lg bg-danger px-2.5 text-xs font-medium text-white disabled:opacity-60"
                                            >
                                                წაშლა
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirming(null)}
                                                aria-label="გაუქმება"
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-background"
                                            >
                                                <Icon icon="solar:close-circle-linear" className="h-[18px] w-[18px]" aria-hidden="true" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setConfirming(item.id)}
                                            aria-label={`${label} — წაშლა`}
                                            title="წაშლა"
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-secondary transition hover:bg-danger/10 hover:text-danger"
                                        >
                                            <Icon icon="solar:trash-bin-trash-linear" className="h-[18px] w-[18px]" aria-hidden="true" />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
