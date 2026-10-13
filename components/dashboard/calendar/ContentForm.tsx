"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import {
    contentPlatforms,
    contentTypes,
} from "@/lib/content/content-options";
import { PlatformIcon } from "./ContentIcons";

type Values = {
    title: string;
    description: string;
    materialUrl: string;
    type: string;
    customType: string;
    scheduledDate: string;
    scheduledTime: string;
    platforms: string[];
    customPlatform: string;
};

function object(value: unknown): Record<string, unknown> | null {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

export default function ContentForm({
    contentId,
    defaultDate,
    onClose,
    onSaved,
}: {
    contentId?: string;
    defaultDate: string;
    onClose: () => void;
    onSaved: (message: string) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();
    const running = useRef(false);
    const pendingBody = useRef<Record<string, unknown> | null>(null);
    const requestId = useRef("");
    const initial = useRef("");

    const [values, setValues] = useState<Values>({
        title: "",
        description: "",
        materialUrl: "",
        type: "POST",
        customType: "",
        scheduledDate: defaultDate,
        scheduledTime: "10:00",
        platforms: [],
        customPlatform: "",
    });

    const [version, setVersion] = useState("");
    const [loading, setLoading] = useState(Boolean(contentId));
    const [ready, setReady] = useState(!contentId);
    const [busy, setBusy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        dialog.current?.showModal();
        return () => dialog.current?.close();
    }, []);

    useEffect(() => {
        if (!contentId) return;

        const controller = new AbortController();
        setLoading(true);
        setReady(false);
        setError("");

        async function load() {
            try {
                const response = await fetch(
                    `/api/content/${encodeURIComponent(contentId!)}`,
                    {
                        cache: "no-store",
                        credentials: "same-origin",
                        signal: controller.signal,
                    },
                );

                const body = object(await response.json());
                const content = object(body?.content);

                if (
                    !response.ok ||
                    body?.success !== true ||
                    !content ||
                    typeof content.title !== "string" ||
                    typeof content.type !== "string" ||
                    typeof content.scheduledAt !== "string" ||
                    typeof content.updatedAt !== "string" ||
                    !Array.isArray(content.channels)
                ) {
                    throw new Error(
                        typeof body?.message === "string"
                            ? body.message
                            : "კონტენტი ვერ ჩაიტვირთა.",
                    );
                }

                const scheduled = new Date(content.scheduledAt);

                if (!Number.isFinite(scheduled.getTime())) {
                    throw new Error("დაგეგმილი დრო ვერ დამუშავდა.");
                }

                const local = new Date(
                    scheduled.getTime() + 4 * 60 * 60 * 1000,
                ).toISOString();

                const platforms = content.channels.map(value => {
                    const channel = object(value);

                    if (typeof channel?.platform !== "string") {
                        throw new Error("პლატფორმა ვერ დამუშავდა.");
                    }

                    return channel.platform;
                });

                const next: Values = {
                    title: content.title,
                    description:
                        typeof content.description === "string"
                            ? content.description
                            : "",
                    materialUrl:
                        typeof content.materialUrl === "string"
                            ? content.materialUrl
                            : "",
                    type: content.type,
                    customType:
                        typeof content.customType === "string"
                            ? content.customType
                            : "",
                    scheduledDate: local.slice(0, 10),
                    scheduledTime: local.slice(11, 16),
                    platforms,
                    customPlatform:
                        content.channels
                            .map(object)
                            .find(channel => channel?.platform === "OTHER")
                            ?.customPlatform as string ?? "",
                };

                if (!controller.signal.aborted) {
                    initial.current = JSON.stringify(next);
                    setValues(next);
                    setVersion(content.updatedAt);
                    setReady(true);
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

        const dirty = contentId
            ? ready && JSON.stringify(values) !== initial.current
            : Boolean(
                values.title.trim() ||
                values.customType.trim() ||
                values.customPlatform.trim() ||
                values.description.trim() ||
                values.materialUrl.trim() ||
                values.platforms.length,
            );

        if (
            (dirty || uncertain) &&
            !window.confirm(
                uncertain
                    ? "შენახვის შედეგი დაუდასტურებელია. დახურვამდე რეკომენდებულია იგივე მოთხოვნით ხელახლა ცდა. მაინც დახურო?"
                    : "ცვლილებები არ არის შენახული. დახურავ ფანჯარას?",
            )
        ) {
            return;
        }

        onClose();
    }

    function change(field: keyof Values, value: string) {
        setValues(current => ({ ...current, [field]: value }));
    }

    async function save() {
        if (running.current || !ready) return;

        running.current = true;
        setBusy(true);
        setError("");

        if (!pendingBody.current) {
            if (!requestId.current) {
                requestId.current = crypto.randomUUID();
            }

            pendingBody.current = contentId
                ? { ...values, action: "edit", updatedAt: version }
                : { ...values, requestId: requestId.current };
        }

        try {
            const response = await fetch(
                contentId
                    ? `/api/content/${encodeURIComponent(contentId)}`
                    : "/api/content",
                {
                    method: contentId ? "PATCH" : "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(pendingBody.current),
                },
            );

            const body = object(
                await response.json().catch(() => null),
            );

            if (response.ok && body?.success === true) {
                pendingBody.current = null;
                setUncertain(false);
                onSaved(
                    contentId
                        ? "კონტენტი წარმატებით განახლდა."
                        : "კონტენტი წარმატებით დაემატა.",
                );
                return;
            }

            if (response.status >= 400 && response.status < 500) {
                pendingBody.current = null;
                setUncertain(false);
            } else {
                setUncertain(true);
            }

            setError(
                typeof body?.message === "string"
                    ? body.message
                    : "შენახვის შედეგი ვერ დადასტურდა. სცადე ხელახლა იგივე მოთხოვნით.",
            );
        } catch {
            setUncertain(true);
            setError(
                "შენახვის შედეგი ვერ დადასტურდა. შეყვანილი ინფორმაცია შენარჩუნებულია; სცადე ხელახლა.",
            );
        } finally {
            running.current = false;
            setBusy(false);
        }
    }

    const field =
        "mt-1 h-11 w-full min-w-0 rounded-xl border border-border " +
        "bg-background px-3 text-[16px] text-text-primary";

    return (
        <dialog
            ref={dialog}
            aria-labelledby={headingId}
            onCancel={event => {
                event.preventDefault();
                close();
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-left text-text-primary backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
            <form
                onSubmit={event => {
                    event.preventDefault();
                    void save();
                }}
                className="space-y-4 p-5"
            >
                <div className="flex items-center justify-between gap-3">
                    <h2 id={headingId} className="text-lg font-semibold">
                        {contentId
                            ? "კონტენტის რედაქტირება"
                            : "ახალი კონტენტი"}
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

                {loading && (
                    <p role="status" className="text-sm text-text-secondary">
                        კონტენტი იტვირთება…
                    </p>
                )}

                {error && (
                    <p
                        role="alert"
                        className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-400"
                    >
                        {error}
                    </p>
                )}

                {!loading && !ready && (
                    <button
                        type="button"
                        onClick={() => setAttempt(value => value + 1)}
                        className="rounded-xl border border-border px-3 py-2 text-sm"
                    >
                        ხელახლა ცდა
                    </button>
                )}

                {ready && (
                    <fieldset
                        disabled={busy || uncertain}
                        className="min-w-0 space-y-4 disabled:opacity-70"
                    >
                        <label className="block text-sm text-text-secondary">
                            სათაური *
                            <input
                                required
                                value={values.title}
                                onChange={event =>
                                    change("title", event.target.value)
                                }
                                className={field}
                            />
                        </label>

                        <div className="space-y-3">
                            <p className="text-sm text-text-secondary">
                                პლატფორმები *
                            </p>

                            <details className="rounded-xl border border-border bg-background">
                                <summary
                                    onClick={event => {
                                        if (busy || uncertain) event.preventDefault();
                                    }}
                                    className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm text-text-primary"
                                >
                                    <span>
                                        {values.platforms.length
                                            ? `არჩეულია ${values.platforms.length} პლატფორმა`
                                            : "აირჩიე პლატფორმები"}
                                    </span>
                                    <Icon
                                        icon="solar:alt-arrow-down-linear"
                                        className="h-4 w-4 shrink-0 text-text-secondary"
                                    />
                                </summary>

                                <div className="space-y-1 border-t border-border p-2">
                                    {contentPlatforms.map(platform => (
                                        <label
                                            key={platform.value}
                                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent/5"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={values.platforms.includes(platform.value)}
                                                onChange={event => {
                                                    const checked = event.target.checked;

                                                    setValues(current => ({
                                                        ...current,
                                                        platforms: checked
                                                            ? [
                                                                ...new Set([
                                                                    ...current.platforms,
                                                                    platform.value,
                                                                ]),
                                                            ]
                                                            : current.platforms.filter(
                                                                value => value !== platform.value,
                                                            ),
                                                    }));
                                                }}
                                                className="h-4 w-4 shrink-0 accent-accent"
                                            />

                                            <PlatformIcon
                                                platform={platform.value}
                                                className="h-5 w-5"
                                            />
                                            <span className="text-sm text-text-primary">
                                                {platform.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </details>

                            {values.platforms.includes("OTHER") && (
                                <label className="block text-sm text-text-secondary">
                                    სხვა პლატფორმის დასახელება *
                                    <input
                                        required
                                        type="text"
                                        placeholder="პლატფორმის სახელი"
                                        value={values.customPlatform}
                                        onChange={event =>
                                            change("customPlatform", event.target.value)
                                        }
                                        className={field}
                                    />
                                </label>
                            )}
                        </div>

                        <label className="block text-sm text-text-secondary">
                            კონტენტის ტიპი
                            <select
                                value={values.type}
                                onChange={event =>
                                    change("type", event.target.value)
                                }
                                className={field}
                            >
                                {contentTypes.map(type => (
                                    <option
                                        key={type.value}
                                        value={type.value}
                                    >
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {values.type === "OTHER" && (
                            <label className="block text-sm text-text-secondary">
                                კონტენტის ტიპის დასახელება *
                                <input
                                    required
                                    type="text"
                                    placeholder="მაგალითად: პირდაპირი ეთერი"
                                    value={values.customType}
                                    onChange={event =>
                                        change("customType", event.target.value)
                                    }
                                    className={field}
                                />
                            </label>
                        )}

                        <div className="grid min-w-0 grid-cols-2 gap-3">
                            <label className="block min-w-0 text-sm text-text-secondary">
                                თარიღი *
                                <input
                                    required
                                    type="date"
                                    value={values.scheduledDate}
                                    onChange={event =>
                                        change(
                                            "scheduledDate",
                                            event.target.value,
                                        )
                                    }
                                    className={field}
                                />
                            </label>

                            <label className="block min-w-0 text-sm text-text-secondary">
                                დრო *
                                <input
                                    required
                                    type="time"
                                    value={values.scheduledTime}
                                    onChange={event =>
                                        change(
                                            "scheduledTime",
                                            event.target.value,
                                        )
                                    }
                                    className={field}
                                />
                            </label>
                        </div>

                        <label className="block text-sm text-text-secondary">
                            აღწერა
                            <textarea
                                rows={4}
                                value={values.description}
                                onChange={event =>
                                    change("description", event.target.value)
                                }
                                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-[16px] text-text-primary"
                            />
                        </label>

                        <label className="block text-sm text-text-secondary">
                            მასალის ბმული
                            <input
                                type="url"
                                placeholder="https://…"
                                value={values.materialUrl}
                                onChange={event =>
                                    change("materialUrl", event.target.value)
                                }
                                className={field}
                            />
                        </label>
                    </fieldset>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={close}
                        className="h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                    >
                        გაუქმება
                    </button>

                    <button
                        type="submit"
                        disabled={busy || loading || !ready}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {busy && (
                            <Icon
                                icon="solar:refresh-linear"
                                className="h-4 w-4 animate-spin"
                            />
                        )}
                        {uncertain ? "ხელახლა ცდა" : "შენახვა"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}