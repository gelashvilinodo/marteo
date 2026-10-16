"use client";

import {
    useState,
    type InputHTMLAttributes,
} from "react";

type Props = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "defaultValue"
> & {
    type?: "date" | "time";
    value?: string;
    defaultValue?: string;
};

function displayValue(value: string, type: "date" | "time") {
    if (!value) {
        return type === "date"
            ? "აირჩიე თარიღი"
            : "აირჩიე დრო";
    }

    if (type === "time") return value;

    const parts = value.split("-");

    if (parts.length !== 3) return value;

    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
}

export default function DateTimeField({
    type = "date",
    value,
    defaultValue = "",
    className = "",
    onChange,
    disabled,
    ...inputProps
}: Props) {
    const [localValue, setLocalValue] = useState(defaultValue);
    const selected = value ?? localValue;

    return (
        <div
            className={[
                "relative isolate flex h-11 w-full min-w-0 max-w-full",
                "items-center overflow-hidden rounded-xl border border-border",
                "bg-background px-3 text-[16px] text-text-primary",
                "focus-within:border-accent focus-within:ring-2",
                "focus-within:ring-accent/20",
                disabled ? "opacity-60" : "",
                className,
            ].join(" ")}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none flex min-w-0 flex-1 items-center justify-between gap-3"
            >
                <span
                    className={`min-w-0 truncate tabular-nums ${selected ? "" : "text-text-secondary"
                        }`}
                >
                    {displayValue(selected, type)}
                </span>

                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-text-secondary"
                >
                    {type === "date" ? (
                        <>
                            <rect
                                x="3"
                                y="5"
                                width="18"
                                height="16"
                                rx="2"
                            />
                            <path d="M16 3v4M8 3v4M3 11h18" />
                        </>
                    ) : (
                        <>
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                        </>
                    )}
                </svg>
            </span>

            <input
                {...inputProps}
                type={type}
                value={selected}
                disabled={disabled}
                onClick={event => {
                    inputProps.onClick?.(event);

                    if (
                        event.defaultPrevented ||
                        event.currentTarget.disabled ||
                        event.currentTarget.readOnly
                    ) {
                        return;
                    }

                    try {
                        event.currentTarget.showPicker?.();
                    } catch {
                        // თუ ბრაუზერი showPicker-ს არ უშვებს,
                        // ველის სტანდარტული ქცევა შენარჩუნდება.
                    }
                }}
                onChange={event => {
                    if (value === undefined) {
                        setLocalValue(event.target.value);
                    }

                    onChange?.(event);
                }}
                className="absolute inset-0 z-10 m-0 block h-full w-full min-w-0 max-w-full cursor-pointer appearance-none border-0 p-0 text-[16px] opacity-0 disabled:cursor-not-allowed"
            />
        </div>
    );
}