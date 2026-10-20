"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type {
    ImportExistingCustomerLink,
    ImportExistingCustomerLinks,
    ImportExistingCustomerMatch,
    ImportCustomerCheckSnapshot,
} from "@/lib/imports/import-types";
import {
    runImportCustomerCheck,
} from "@/lib/imports/run-import-customer-check";

type CheckProps = {
    autoCheck?: boolean;
    phones: string[];
    links: ImportExistingCustomerLinks;
    onLinkChange: (
        phone: string,
        link: ImportExistingCustomerLink | null,
    ) => void;
    onSkipPhone: (phone: string) => void;
    onChecked: (snapshot: ImportCustomerCheckSnapshot | null) => void;
};

type CustomerMatch = ImportExistingCustomerMatch;

function ExistingCustomersCheckSession({
    phones,
    links,
    onLinkChange,
    onSkipPhone,
    onChecked,
    autoCheck = false,
}: CheckProps) {
    const [busy, setBusy] = useState(false);
    const [checked, setChecked] = useState(0);
    const [matches, setMatches] = useState<CustomerMatch[] | null>(null);
    const [error, setError] = useState("");
    const [businessId, setBusinessId] = useState<string | null>(null);
    const [failedPhones, setFailedPhones] = useState<string[]>([]);
    const previousCheck = useRef<ImportCustomerCheckSnapshot | null>(null);

    const controller = useRef<AbortController | null>(null);
    const running = useRef(false);

    useEffect(() => {
        onChecked(null);

        return () => {
            controller.current?.abort();
            onChecked(null);
        };
    }, [onChecked]);

    async function checkCustomers(retryFailed = false) {
        if (running.current || phones.length === 0) return;

        running.current = true;

        const abort = new AbortController();
        controller.current = abort;

        setBusy(true);
        setError("");

        try {
            const result = await runImportCustomerCheck({
                phones,
                previous: retryFailed ? previousCheck.current : null,
                signal: abort.signal,
                onProgress: snapshot => {
                    if (abort.signal.aborted) return;

                    previousCheck.current = snapshot;
                    setBusinessId(snapshot.businessId);
                    setChecked(snapshot.checkedPhones.length);
                    setFailedPhones(snapshot.failedPhones);
                    setMatches(snapshot.matches);
                    onChecked(snapshot);
                },
            });

            if (!abort.signal.aborted) {
                setError(result.message);
            }
        } catch (cause: unknown) {
            if (!abort.signal.aborted) {
                previousCheck.current = null;
                setMatches(null);
                setBusinessId(null);
                setChecked(0);
                setFailedPhones([]);
                onChecked(null);

                setError(
                    cause instanceof Error
                        ? cause.message
                        : "შემოწმება ვერ დასრულდა.",
                );
            }
        } finally {
            running.current = false;

            if (!abort.signal.aborted) setBusy(false);
        }
    }

    const startCheck = useEffectEvent(() => { void checkCustomers(); });
    useEffect(() => {
        if (!autoCheck) return;
        let active = true;
        queueMicrotask(() => { if (active) startCheck(); });
        return () => { active = false; };
    }, [autoCheck]);

    const groups = new Map<string, CustomerMatch[]>();

    for (const match of matches ?? []) {
        const group = groups.get(match.normalizedPhone) ?? [];

        group.push(match);
        groups.set(match.normalizedPhone, group);
    }

    return (
        <section className="space-y-3 border-t border-border pt-4">
            <h3 className="font-semibold">
                MARTEO-ში არსებული მომხმარებლები
            </h3>

            <p className="text-sm text-text-secondary">
                შევადარებთ გამართულ, იმპორტიდან გამოუტოვებელ
                ჩანაწერებში მითითებულ ნომრებს.
                არსებული მონაცემები არ შეიცვლება.
            </p>

            <button
                type="button"
                disabled={busy}
                onClick={() => void checkCustomers()}
                className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
            >
                {busy
                    ? "მოწმდება…"
                    : matches === null
                        ? "არსებული მომხმარებლების შემოწმება"
                        : "ხელახლა შემოწმება"}
            </button>

            {failedPhones.length > 0 && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void checkCustomers(true)}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                >
                    მხოლოდ დაუდასტურებელი ნაწილის შემოწმება
                </button>
            )}

            {busy && (
                <p role="status" className="text-sm text-text-secondary">
                    შემოწმებულია {checked} / {phones.length} ნომერი.
                </p>
            )}

            {error && (
                <div role="alert" className="space-y-2 text-sm">
                    <p className="text-danger">{error}</p>
                    <p className="text-text-secondary">
                        ეს მომხმარებლის მონაცემების შეცდომას არ ნიშნავს.
                        წარმატებული შემოწმებები შენარჩუნებულია.
                        დაუდასტურებელი ნაწილი ხელახლა შეამოწმე,
                        დროებით გამოტოვე ან მონახაზი შეინახე.
                    </p>
                </div>
            )}

            {matches !== null && !busy && (
                <>
                    <p role="status" className="text-sm">
                        დადასტურებულია {checked} / {phones.length} ნომერი.
                        {" "}MARTEO-ში დამთხვევა მოიძებნა{" "}
                        {groups.size} ნომერზე.
                    </p>

                    {groups.size === 0 && failedPhones.length === 0 && (
                        <p className="text-sm text-text-secondary">
                            დამთხვევა ვერ მოიძებნა.
                        </p>
                    )}

                    <div className="max-h-96 space-y-3 overflow-y-auto">
                        {[...groups].map(([phone, customers]) => (
                            <div
                                key={phone}
                                className="space-y-3 rounded-xl border border-border p-3 text-sm"
                            >
                                <p className="font-semibold">
                                    {phone}
                                </p>

                                {customers.length > 1 && (
                                    <p className="text-danger">
                                        ამ ნომრით რამდენიმე არსებული
                                        ჩანაწერია. ავტომატური დაკავშირება
                                        უსაფრთხოდ ვერ განისაზღვრება.
                                    </p>
                                )}

                                {customers.map(customer => (
                                    <div
                                        key={customer.id}
                                        className="space-y-1 border-t border-border pt-2"
                                    >
                                        <p>
                                            {[
                                                customer.firstName,
                                                customer.lastName,
                                            ]
                                                .filter(Boolean)
                                                .join(" ") ||
                                                "სახელი და გვარი მითითებული არ არის"}
                                        </p>

                                        <p className="whitespace-pre-wrap break-words text-text-secondary">
                                            {customer.address ||
                                                "მისამართი მითითებული არ არის"}
                                        </p>

                                        <p className="text-text-secondary">
                                            {customer.deletedAt
                                                ? "ადრე წაშლილი მომხმარებელი — ავტომატურად არ აღდგება."
                                                : "არსებული მომხმარებელი — მონაცემები ავტომატურად არ გადაიწერება."}
                                        </p>
                                        {!customer.deletedAt && businessId && (
                                            <div className="space-y-2 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const current = links[phone];

                                                        const selected =
                                                            current?.customerId === customer.id &&
                                                            current.businessId === businessId &&
                                                            current.updatedAt === customer.updatedAt;

                                                        onLinkChange(
                                                            phone,
                                                            selected
                                                                ? null
                                                                : {
                                                                    businessId,
                                                                    customerId: customer.id,
                                                                    normalizedPhone: phone,
                                                                    updatedAt: customer.updatedAt,
                                                                },
                                                        );
                                                    }}
                                                    className="min-h-11 rounded-xl border border-border px-3"
                                                >
                                                    {links[phone]?.customerId === customer.id &&
                                                        links[phone]?.businessId === businessId &&
                                                        links[phone]?.updatedAt === customer.updatedAt
                                                        ? "კავშირი არჩეულია — გაუქმება"
                                                        : "ამ მომხმარებელთან დაკავშირება"}
                                                </button>

                                                <p className="text-xs text-text-secondary">
                                                    დარჩება MARTEO-ში არსებული სახელი,
                                                    გვარი და მისამართი. ფაილის მონაცემები
                                                    მათ არ გადააწერს.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        onLinkChange(phone, null);
                                        onSkipPhone(phone);
                                    }}
                                    className="min-h-11 rounded-xl border border-danger/40 px-3 text-danger"
                                >
                                    ამ ნომრის ჩანაწერების გამოტოვება
                                </button>

                                <p className="text-xs text-text-secondary">
                                    გამოიტოვება ამ ნომრის მქონე ყველა მომხმარებლის
                                    ჩანაწერი ატვირთული მონაცემებიდან.
                                    მათი დაბრუნება გამოტოვებული მომხმარებლების
                                    სიიდან შეგიძლია.
                                </p>
                            </div>
                        ))}
                    </div>

                    <p className="text-xs text-text-secondary">
                        ეს შედარების შედეგია, დაკავშირების
                        გადაწყვეტილება ჯერ არ მიღებულა.
                        საბოლოო შენახვამდე დამთხვევებს
                        ხელახლა შევამოწმებთ.
                    </p>
                </>
            )}
        </section>
    );
}

export default function ExistingCustomersCheck({
    phones,
    links,
    onLinkChange,
    onSkipPhone,
    onChecked,
    autoCheck = false,
}: CheckProps) {
    const uniquePhones = [...new Set(phones)].sort();

    if (uniquePhones.length === 0) return null;

    return (
        <ExistingCustomersCheckSession
            key={JSON.stringify(uniquePhones)}
            autoCheck={autoCheck}
            phones={uniquePhones}
            links={links}
            onLinkChange={onLinkChange}
            onSkipPhone={onSkipPhone}
            onChecked={onChecked}
        />
    );
}