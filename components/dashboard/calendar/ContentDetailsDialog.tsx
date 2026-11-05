"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { CalendarContent } from "@/lib/content/get-calendar-page";
import { contentTypes } from "@/lib/content/content-options";
import PlatformBadge from "./PlatformBadge";
import { calendarDialogClass } from "./dialog-style";

type Detail = CalendarContent & {
    description: string | null;
    materialUrl: string | null;
};

type Operation = {
    method: "PATCH" | "DELETE";
    body: Record<string, unknown>;
    message: string;
    // მონიშვნა ეკრანზე მაშინვე ჩანს; შეცდომისას წინა მდგომარეობა ბრუნდება.
    optimistic?: (detail: Detail) => Detail;
};

function object(value: unknown): Record<string, unknown> | null {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function date(value: string | null) {
    if (!value) return "-";

    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "-";

    const local = new Date(
        parsed.getTime() + 4 * 60 * 60 * 1000,
    ).toISOString();

    const [year, month, day] = local.slice(0, 10).split("-");
    return `${day}.${month}.${year} ${local.slice(11, 16)}`;
}

export default function ContentDetailsDialog({
    contentId,
    onClose,
    onEdit,
    onChanged,
}: {
    contentId: string;
    onClose: () => void;
    onEdit: (id: string) => void;
    onChanged: (message: string) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();
    const running = useRef(false);
    const retry = useRef<Operation | null>(null);

    const [detail, setDetail] = useState<Detail | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [uncertain, setUncertain] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        dialog.current?.showModal();
        return () => dialog.current?.close();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");

        async function load() {
            try {
                const response = await fetch(
                    `/api/content/${encodeURIComponent(contentId)}`,
                    {
                        cache: "no-store",
                        credentials: "same-origin",
                        signal: controller.signal,
                    },
                );

                const body = object(await response.json());
                const value = object(body?.content);

                if (
                    !response.ok ||
                    body?.success !== true ||
                    !value ||
                    value.id !== contentId ||
                    typeof value.title !== "string" ||
                    typeof value.updatedAt !== "string" ||
                    !Array.isArray(value.channels)
                ) {
                    throw new Error(
                        typeof body?.message === "string"
                            ? body.message
                            : "კონტენტი ვერ ჩაიტვირთა.",
                    );
                }

                if (!controller.signal.aborted) {
                    setDetail(value as unknown as Detail);
                }
            } catch (cause: unknown) {
                if (!controller.signal.aborted) {
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : "კონტენტი ვერ ჩაიტვირთა.",
                    );
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        void load();
        return () => controller.abort();
    }, [contentId, attempt]);

    function close() {
        if (running.current) return;

        if (
            uncertain &&
            !window.confirm(
                "მოქმედების შედეგი დაუდასტურებელია. მაინც დახუროთ ფანჯარა?",
            )
        ) {
            return;
        }

        onClose();
    }

    function platformOperation(
        current: Detail,
        platform: string | null,
        completed: boolean,
    ): Operation {
        const now = new Date().toISOString();

        return {
            method: "PATCH",
            body: platform
                ? { action: "platform", platform, completed, updatedAt: current.updatedAt }
                : { action: "all-platforms", completed, updatedAt: current.updatedAt },
            message: platform
                ? completed
                    ? "პლატფორმაზე შესრულება მოინიშნა."
                    : "შესრულების მონიშვნა მოიხსნა."
                : "ყველა პლატფორმაზე შესრულება მოინიშნა.",
            optimistic: value => {
                const channels = value.channels.map(channel =>
                    platform === null || channel.platform === platform
                        ? {
                            ...channel,
                            completedAt: completed
                                ? channel.completedAt ?? now
                                : null,
                        }
                        : channel,
                );

                return {
                    ...value,
                    channels,
                    status: channels.every(channel => channel.completedAt !== null)
                        ? "PUBLISHED"
                        : "SCHEDULED",
                };
            },
        };
    }

    async function perform(operation: Operation) {
        if (running.current) return;

        running.current = true;
        retry.current = operation;
        setBusy(true);
        setError("");

        const previous = detail;
        if (operation.optimistic && previous) {
            setDetail(operation.optimistic(previous));
        }

        try {
            const response = await fetch(
                `/api/content/${encodeURIComponent(contentId)}`,
                {
                    method: operation.method,
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(operation.body),
                },
            );

            const body = object(
                await response.json().catch(() => null),
            );

            if (response.ok && body?.success === true) {
                retry.current = null;
                setUncertain(false);
                setConfirming(false);

                const content = object(body.content);

                if (operation.method === "DELETE") {
                    onClose();
                } else if (
                    content?.id === contentId &&
                    Array.isArray(content.channels)
                ) {
                    setDetail(current =>
                        current ? { ...current, ...(content as unknown as Detail) } : current,
                    );
                } else {
                    setAttempt(value => value + 1);
                }

                onChanged(operation.message);
                return;
            }

            if (response.status >= 400 && response.status < 500) {
                retry.current = null;
                setUncertain(false);
                if (operation.optimistic && previous) setDetail(previous);
            } else {
                setUncertain(true);
            }

            setError(
                typeof body?.message === "string"
                    ? body.message
                    : "მოქმედების შედეგი ვერ დადასტურდა.",
            );
        } catch {
            setUncertain(true);
            setError(
                "მოქმედების შედეგი ვერ დადასტურდა. სცადეთ ხელახლა იგივე მოთხოვნით.",
            );
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    return (
        <dialog
            ref={dialog}
            aria-labelledby={headingId}
            onCancel={event => {
                event.preventDefault();
                close();
            }}
            className={calendarDialogClass}
        >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface p-4">
                <h2 id={headingId} className="font-semibold">
                    კონტენტის დეტალები
                </h2>

                <button
                    type="button"
                    disabled={busy}
                    onClick={close}
                    aria-label="დახურვა"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary disabled:opacity-50"
                >
                    <Icon
                        icon="solar:close-circle-linear"
                        className="h-5 w-5"
                    />
                </button>
            </div>

            <div className="space-y-4 p-4">
                {loading && (
                    <p role="status" className="text-sm text-text-secondary">
                        კონტენტი იტვირთება…
                    </p>
                )}

                {error && (
                    <p
                        role="alert"
                        className="rounded-xl border border-red-600/30 bg-red-600/10 p-3 text-sm text-red-600"
                    >
                        {error}
                    </p>
                )}

                {uncertain && retry.current && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            if (retry.current) void perform(retry.current);
                        }}
                        className="h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                    >
                        ხელახლა ცდა
                    </button>
                )}

                {!loading && error && !uncertain && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAttempt(value => value + 1)}
                        className="rounded-xl border border-border px-3 py-2 text-sm"
                    >
                        მონაცემების განახლება
                    </button>
                )}

                {detail && (
                    <>
                        <div>
                            <h3 className="break-words text-lg font-semibold">
                                {detail.title}
                            </h3>
                            <p className="mt-2 text-xs text-text-secondary">
                                {detail.type === "OTHER"
                                    ? detail.customType || "სხვა"
                                    : contentTypes.find(
                                        type => type.value === detail.type,
                                    )?.label ?? detail.type}
                                {" · "}
                                {date(detail.scheduledAt)}
                            </p>
                        </div>

                        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">
                                    პლატფორმების შესრულება
                                </p>

                                {detail.status !== "CANCELED" &&
                                    detail.channels.length > 1 &&
                                    detail.channels.some(channel => channel.completedAt === null) && (
                                        <button
                                            type="button"
                                            disabled={busy || loading || uncertain}
                                            onClick={() =>
                                                void perform(platformOperation(detail, null, true))
                                            }
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 text-xs font-medium text-success disabled:opacity-50"
                                        >
                                            <Icon
                                                icon="solar:checklist-minimalistic-linear"
                                                className="h-4 w-4"
                                            />
                                            ყველა შესრულებულია
                                        </button>
                                    )}
                            </div>

                            {detail.channels.map(channel => (
                                <div key={channel.id}>
                                    <PlatformBadge
                                        platform={channel.platform}
                                        customPlatform={channel.customPlatform}
                                        completedAt={channel.completedAt}
                                        disabled={
                                            busy ||
                                            loading ||
                                            uncertain ||
                                            detail.status === "CANCELED"
                                        }
                                        onToggle={() =>
                                            void perform(platformOperation(
                                                detail,
                                                channel.platform,
                                                channel.completedAt === null,
                                            ))
                                        }
                                    />

                                    {channel.completedAt && (
                                        <p className="mt-1 text-xs text-text-secondary">
                                            შესრულდა: {date(channel.completedAt)}
                                        </p>
                                    )}
                                </div>
                            ))}

                            {detail.status === "PUBLISHED" && (
                                <p className="text-xs text-success">
                                    ყველა პლატფორმაზე შესრულებულია
                                </p>
                            )}

                            {detail.status === "CANCELED" && (
                                <p className="text-xs text-text-secondary">
                                    კონტენტი გაუქმებულია
                                </p>
                            )}
                        </div>

                        {detail.description && (
                            <div>
                                <h4 className="text-xs text-text-secondary">
                                    აღწერა
                                </h4>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                                    {detail.description}
                                </p>
                            </div>
                        )}

                        {detail.materialUrl &&
                            /^https?:\/\//i.test(detail.materialUrl) && (
                                <a
                                    href={detail.materialUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-accent"
                                >
                                    <Icon
                                        icon="solar:link-linear"
                                        className="h-5 w-5"
                                    />
                                    მასალის გახსნა
                                </a>
                            )}

                        {confirming ? (
                            <div className="space-y-3 rounded-xl border border-red-600/30 bg-red-600/10 p-3">
                                <p className="text-sm">
                                    წაიშალოს ეს კონტენტი და მისი პლატფორმების
                                    შესრულების ჩანაწერები?
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={busy || uncertain}
                                        onClick={() =>
                                            void perform({
                                                method: "DELETE",
                                                body: {
                                                    updatedAt: detail.updatedAt,
                                                },
                                                message:
                                                    "კონტენტი წარმატებით წაიშალა.",
                                            })
                                        }
                                        className="delete-button h-10 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
                                    >
                                        წაშლა
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setConfirming(false)}
                                        className="h-10 rounded-xl border border-border px-4 text-sm"
                                    >
                                        გაუქმება
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                                <button
                                    type="button"
                                    disabled={busy || loading || uncertain}
                                    onClick={() => onEdit(detail.id)}
                                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                                >
                                    <Icon
                                        icon="solar:pen-linear"
                                        className="h-5 w-5 text-accent"
                                    />
                                    რედაქტირება
                                </button>

                                <button
                                    type="button"
                                    disabled={busy || loading || uncertain}
                                    onClick={() => setConfirming(true)}
                                    className="delete-action inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm disabled:opacity-50"
                                >
                                    <Icon
                                        icon="solar:trash-bin-trash-linear"
                                        className="h-5 w-5"
                                    />
                                    წაშლა
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            {/* ღილაკები iPhone-ის ქვედა ზოლს არ ეფარება. */}
            <div aria-hidden="true" className="max-sm:h-[env(safe-area-inset-bottom)]" />
        </dialog>
    );
}