"use client";

import { useId, useState } from "react";

type Props = {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    required?: boolean;
    maxLength?: number;
};

function clean(value: string) {
    return value
        .normalize("NFC")
        .replace(/\s+/gu, " ")
        .trim();
}

function key(value: string) {
    return clean(value).normalize("NFKC").toLowerCase();
}

function editDistance(first: string, second: string): number {
    const a = Array.from(first);
    const b = Array.from(second);

    const table = Array.from(
        { length: a.length + 1 },
        () => Array<number>(b.length + 1).fill(0),
    );

    for (let i = 0; i <= a.length; i += 1) {
        table[i][0] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
        table[0][j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

            table[i][j] = Math.min(
                table[i - 1][j] + 1,
                table[i][j - 1] + 1,
                table[i - 1][j - 1] + substitutionCost,
            );

            // მეზობელი ასოების ადგილების შემთხვევითი გაცვლა.
            if (
                i > 1 &&
                j > 1 &&
                a[i - 1] === b[j - 2] &&
                a[i - 2] === b[j - 1]
            ) {
                table[i][j] = Math.min(
                    table[i][j],
                    table[i - 2][j - 2] + 1,
                );
            }
        }
    }

    return table[a.length][b.length];
}

export default function AttributeInput({
    label,
    value,
    options,
    onChange,
    required = false,
    maxLength = 100,
}: Props) {
    const listId = useId();
    const [reviewedValue, setReviewedValue] = useState<string | null>(null);

    const uniqueOptions = new Map<string, string>();

    for (const option of options) {
        const name = clean(option);
        if (!name) continue;

        const normalized = key(name);

        if (!uniqueOptions.has(normalized)) {
            uniqueOptions.set(normalized, name);
        }
    }

    const suggestions = [...uniqueOptions.values()].sort(
        (a, b) => a.localeCompare(b, "ka"),
    );

    const currentKey = key(value);

    const similarOptions =
        reviewedValue === currentKey &&
            Array.from(currentKey).length >= 3 &&
            !uniqueOptions.has(currentKey)
            ? suggestions
                .map((name) => ({
                    name,
                    distance: editDistance(currentKey, key(name)),
                }))
                .filter((item) => item.distance === 1)
                .slice(0, 3)
            : [];

    function finishEditing() {
        const name = clean(value);
        const normalized = key(name);
        const existing = uniqueOptions.get(normalized);

        onChange(existing ?? name);
        setReviewedValue(normalized);
    }

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-text-secondary">
                <span>
                    {label}
                    {required ? " *" : ""}
                </span>

                <input
                    type="text"
                    list={listId}
                    value={value}
                    required={required}
                    maxLength={maxLength}
                    autoComplete="off"
                    placeholder="აირჩიე ან ჩაწერე"
                    onChange={(event) => {
                        setReviewedValue(null);
                        onChange(event.target.value);
                    }}
                    onBlur={finishEditing}
                    className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 text-[16px] lg:text-xs text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 lg:h-8" />

                <datalist id={listId}>
                    {suggestions.map((option) => (
                        <option key={key(option)} value={option} />
                    ))}
                </datalist>
            </label>

            {similarOptions.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                    <p className="text-xs text-text-secondary">
                        მსგავსი მნიშვნელობა უკვე გაქვს:
                    </p>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {similarOptions.map((option) => (
                            <button
                                key={key(option.name)}
                                type="button"
                                onClick={() => {
                                    onChange(option.name);
                                    setReviewedValue(null);
                                }}
                                className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary transition hover:border-accent"
                            >
                                {option.name}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => setReviewedValue(null)}
                        className="mt-2 text-xs text-text-secondary underline underline-offset-2"
                    >
                        ჩემი ჩანაწერი დავტოვო
                    </button>
                </div>
            )}
        </div>
    );
}