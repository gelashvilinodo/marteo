"use client";

import {
    productStockPolicyOptions,
    type ProductStockPolicy,
} from "@/lib/imports/product-stock-policy";

type Props = {
    affectedCount: number;
    value: ProductStockPolicy | null;
    onChange: (value: ProductStockPolicy | null) => void;
};

export default function ProductStockPolicyPicker({
    affectedCount,
    value,
    onChange,
}: Props) {
    if (affectedCount === 0) return null;

    return (
        <fieldset className="min-w-0 space-y-3 rounded-xl border border-border p-4">
            <legend className="px-1 font-semibold">
                არსებული პროდუქტების ნაშთი
            </legend>

            <p className="text-sm text-text-secondary">
                {affectedCount} ჩანაწერი არსებულ პროდუქტს უკავშირდება
                და ფაილში რაოდენობაც აქვს მითითებული.
                აირჩიე, როგორ გამოვიყენოთ ეს რაოდენობები.
                არჩევანი ქვემოთ ჩამოთვლილ ყველა ასეთ ჩანაწერს ეხება.
            </p>

            <p className="text-sm text-text-secondary">
                ახალი პროდუქტებისთვის ფაილის რაოდენობა საწყისი
                ნაშთი იქნება.
            </p>

            <div className="space-y-3">
                {productStockPolicyOptions.map(option => (
                    <label
                        key={option.value}
                        className={[
                            "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                            value === option.value
                                ? "border-blue-500 bg-blue-500/5"
                                : "border-border",
                        ].join(" ")}
                    >
                        <input
                            type="radio"
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                            className="mt-1 h-4 w-4 shrink-0"
                        />

                        <span className="min-w-0 space-y-1">
                            <span className="block text-sm font-semibold">
                                {option.label}
                            </span>

                            <span className="block text-sm text-text-secondary">
                                {option.description}
                            </span>
                        </span>
                    </label>
                ))}
            </div>

            {value === null ? (
                <p className="text-sm text-text-secondary">
                    რაოდენობის გამოყენების წესი ჯერ არჩეული არ არის.
                </p>
            ) : (
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="min-h-11 rounded-xl border border-border px-3 text-sm"
                >
                    არჩევანის გაუქმება
                </button>
            )}
        </fieldset>
    );
}