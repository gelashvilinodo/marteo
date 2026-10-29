"use client";

import { useId } from "react";
import {
    validateProductStockDate,
} from "@/lib/imports/product-stock-date";

type Props = {
    affectedCount: number;
    value: string | null;
    onChange: (value: string | null) => void;
};

export default function ProductStockDateInput({
    affectedCount,
    value,
    onChange,
}: Props) {
    const id = useId();

    if (affectedCount === 0) return null;

    let error: string | null = null;

    try {
        if (validateProductStockDate(value) === null) {
            error = "აირჩიე, რომელ დღეს არსებულ ნაშთს ტვირთავ. ეს ველი ერთხელ ივსება.";
        }
    } catch (cause) {
        error =
            cause instanceof Error
                ? cause.message
                : "თარიღი გადასამოწმებელია.";
    }

    return (
        <section id="import-stock-date" className={`space-y-3 rounded-xl border p-4 ${error ? "border-danger/60" : "border-border"}`}>
            <label
                htmlFor={id}
                className="block text-sm font-semibold"
            >
                მარაგის თარიღი - აუცილებელია
            </label>

            <p className="text-sm text-text-secondary">
                მიუთითე, რომელ თარიღს ეხება გადმოსატანი მარაგი.
                ეს თარიღი გამოყენებული იქნება ყველა იმ
                ჩანაწერისთვის, რომლის რაოდენობაც გადმოგვაქვს.
            </p>

            <input
                id={id}
                type="date"
                value={value ?? ""}
                onChange={event =>
                    onChange(event.target.value || null)
                }
                aria-invalid={error !== null}
                aria-describedby={`${id}-message`}
                required
                className={`min-h-11 w-full rounded-xl border bg-surface px-3 text-sm sm:max-w-xs ${error ? "border-danger" : "border-border"}`}
            />

            <p
                id={`${id}-message`}
                className={
                    error
                        ? "text-sm text-danger"
                        : "text-sm text-text-secondary"
                }
            >
                {error ??
                    (value
                        ? `თარიღი შეეხება ${affectedCount} ჩანაწერს.`
                        : "თარიღი ჯერ მითითებული არ არის.")}
            </p>
        </section>
    );
}
