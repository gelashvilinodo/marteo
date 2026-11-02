"use client";

import { Icon } from "@iconify/react";

import type { BusinessPermission } from "@/lib/business/permissions";
import { PERMISSION_OPTIONS } from "@/lib/business/team";

// თანამშრომლის უფლებების არჩევა: ყოველ ბარათზე წერია, რას შეძლებს და რას ვერ.
export default function PermissionPicker({ options = PERMISSION_OPTIONS, permissions, readOnly, disabled, onToggle, onReadOnly }: {
    options?: typeof PERMISSION_OPTIONS;
    permissions: BusinessPermission[];
    readOnly: boolean;
    disabled: boolean;
    onToggle: (permission: BusinessPermission) => void;
    onReadOnly: () => void;
}) {
    return (
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text-primary">რაზე ჰქონდეს წვდომა?</legend>
            <p className="text-sm text-text-secondary">შეგიძლია რამდენიმე მონიშნო.</p>
            {options.map(option => {
                const checked = permissions.includes(option.value);
                return (
                    <label key={option.value} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-accent bg-accent/10" : "border-border hover:bg-background"}`}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(option.value)}
                            className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                        <span className="min-w-0">
                            <span className="flex items-center gap-2 font-medium text-text-primary">
                                <Icon icon={option.icon} className="size-5 shrink-0 text-accent" aria-hidden="true" />
                                {option.label}
                            </span>
                            <span className="mt-1 block text-sm text-text-secondary">{option.can}</span>
                            <span className="block text-sm text-text-secondary">{option.cannot}</span>
                        </span>
                    </label>
                );
            })}
            <label className="mt-3 flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-dashed border-border p-3">
                <input type="checkbox" checked={readOnly} disabled={disabled} onChange={onReadOnly}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium text-text-primary">
                        <Icon icon="solar:eye-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />
                        მხოლოდ ნახვა
                    </span>
                    <span className="mt-1 block text-sm text-text-secondary">მონიშნულს დაინახავს, მაგრამ ვერაფერს შეცვლის.</span>
                </span>
            </label>
        </fieldset>
    );
}
