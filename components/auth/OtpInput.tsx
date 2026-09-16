"use client";

import { useRef } from "react";

type OtpInputProps = {
    idPrefix: string;
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
};

export default function OtpInput({
    idPrefix,
    value,
    onChange,
    disabled = false,
}: OtpInputProps) {
    const inputs = useRef<Array<HTMLInputElement | null>>([]);

    const insertDigits = (raw: string, index: number) => {
        const digits = raw.replace(/\D/g, "");
        if (!digits) return;

        // A complete pasted/autofilled code replaces all six digits.
        const start = digits.length >= value.length ? 0 : index;
        const next = [...value];
        const inserted = digits.slice(0, value.length - start);

        inserted.split("").forEach((digit, offset) => {
            next[start + offset] = digit;
        });

        onChange(next);

        inputs.current[
            Math.min(start + inserted.length, value.length - 1)
        ]?.focus();
    };

    return (
        <div
            role="group"
            aria-label={
                idPrefix === "email"
                    ? "ელფოსტის დამადასტურებელი კოდი"
                    : "ტელეფონის დამადასტურებელი კოდი"
            }
            className="mx-auto grid w-full max-w-[328px] grid-cols-6 gap-2"
        >
            {value.map((digit, index) => (
                <input
                    key={index}
                    ref={(element) => {
                        inputs.current[index] = element;
                    }}
                    id={`${idPrefix}-${index}`}
                    aria-label={`ციფრი ${index + 1} / ${value.length}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={value.length}
                    value={digit}
                    disabled={disabled}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                        if (!event.target.value) {
                            const next = [...value];
                            next[index] = "";
                            onChange(next);
                            return;
                        }

                        insertDigits(event.target.value, index);
                    }}
                    onPaste={(event) => {
                        event.preventDefault();
                        insertDigits(
                            event.clipboardData.getData("text"),
                            index
                        );
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Backspace") {
                            event.preventDefault();

                            const target =
                                value[index] || index === 0
                                    ? index
                                    : index - 1;

                            const next = [...value];
                            next[target] = "";
                            onChange(next);
                            inputs.current[target]?.focus();
                        }

                        if (event.key === "ArrowLeft" && index > 0) {
                            event.preventDefault();
                            inputs.current[index - 1]?.focus();
                        }

                        if (
                            event.key === "ArrowRight" &&
                            index < value.length - 1
                        ) {
                            event.preventDefault();
                            inputs.current[index + 1]?.focus();
                        }
                    }}
                    className="h-12 w-full min-w-0 rounded-xl border border-border bg-background text-center text-lg font-semibold text-text-primary outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                />
            ))}
        </div>
    );
}