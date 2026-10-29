"use client";

import { useState } from "react";
import CustomerRowEditor from "./CustomerRowEditor";
import type { ImportCustomerEdits } from "@/lib/imports/import-types";
import ExistingCustomersCheck from "./ExistingCustomersCheck";
import {
    buildCustomerImportPlan,
} from "@/lib/imports/build-customer-import-plan";

import {
    prepareImportCustomers,
    type CustomerImportSource,
    type PreparedImportCustomer,
} from "@/lib/imports/prepare-import-customers";
import type {
    ImportExistingCustomerLink,
    ImportExistingCustomerLinks,
    ImportCustomerCheckSnapshot,
} from "@/lib/imports/import-types";
import ImportSelectedSheets from "./ImportSelectedSheets";

type PhoneEdit = {
    key: string;
    value: string;
};

export default function ImportCustomersSummary({
    sources,
    onPhoneChange,
    excludedKeys,
    onExcludedChange,
    existingLinks,
    onExistingLinkChange,
    onCustomersChecked,
    customerCheckSnapshot,
    onDisableSource,
    autoReview = false,
    onEdit,
}: {
    autoReview?: boolean;
    onEdit?: (fileId: string, sheetName: string, rowNumber: number, changes: ImportCustomerEdits[number]) => void;
    sources: CustomerImportSource[];
    onDisableSource: (fileId: string, sheetName: string) => void;
    onPhoneChange: (
        fileId: string,
        sheetName: string,
        rowNumber: number,
        phone: string,
    ) => void;
    excludedKeys: string[];
    onExcludedChange: (keys: string[]) => void;
    existingLinks: ImportExistingCustomerLinks;
    customerCheckSnapshot: ImportCustomerCheckSnapshot | null;
    onCustomersChecked: (
        snapshot: ImportCustomerCheckSnapshot | null,
    ) => void;
    onExistingLinkChange: (
        phone: string,
        link: ImportExistingCustomerLink | null,
    ) => void;
}) {
    const [visible, setVisible] = useState(autoReview);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editNotice, setEditNotice] = useState("");
    const [showReady, setShowReady] = useState(false);
    const [phoneEdit, setPhoneEdit] = useState<PhoneEdit | null>(null);

    const activeSources = sources.filter(
        source => source.mapping.enabled === true,
    );

    if (activeSources.length === 0) return null;

    const result = visible
        ? prepareImportCustomers(activeSources, excludedKeys)
        : null;

    const records = result?.records ?? [];

    const plan = buildCustomerImportPlan({
        records,
        snapshot: customerCheckSnapshot,
        links: existingLinks,
    });

    const waitingForCheck = plan.items.filter(
        item => item.reasonCode === "WAITING_FOR_CHECK",
    );

    const actionableProblems = plan.items.filter(
        item =>
            item.action === "BLOCKED" &&
            item.record.status !== "INVALID" &&
            item.reasonCode !== "WAITING_FOR_CHECK",
    );

    const excludedSet = new Set(excludedKeys);

    const excludedRecords =
        visible && excludedKeys.length > 0
            ? prepareImportCustomers(activeSources).records.filter(
                record => excludedSet.has(record.key),
            )
            : [];

    const ready = records.filter(
        record => record.status === "READY",
    ).length;

    const invalid = records.filter(
        record => record.status === "INVALID",
    ).length;

    const review = records.filter(
        record => record.status === "NEEDS_REVIEW",
    ).length;

    const labels = {
        READY: "სავალდებულო მონაცემები გამართულია",
        INVALID: "საჭიროა შესწორება",
        NEEDS_REVIEW: "დუბლირებული ტელეფონი",
    } as const;

    const byKey = new Map(
        records.map(record => [record.key, record]),
    );

    const visited = new Set<string>();
    const groups: PreparedImportCustomer[][] = [];

    for (const record of records) {
        if (visited.has(record.key)) continue;

        const group = [
            record,
            ...record.duplicateKeys.flatMap(key => {
                const other = byKey.get(key);

                return other && !visited.has(key)
                    ? [other]
                    : [];
            }),
        ];

        for (const item of group) {
            visited.add(item.key);
        }

        groups.push(group);
    }

    function renderCard(
        record: PreparedImportCustomer,
        duplicate: boolean,
    ) {
        const editing = phoneEdit?.key === record.key;

        return (
            <article
                className={[
                    "min-w-0 space-y-3 rounded-xl border bg-surface p-3 text-sm",
                    duplicate || record.status === "INVALID"
                        ? "border-danger/60"
                        : "border-border",
                ].join(" ")}
            >
                <div className="space-y-1">
                    <p className="break-words font-semibold">
                        {record.fileName}
                        {" / "}
                        {record.sheetName}
                        {" - რიგი "}
                        {record.rowNumber}
                    </p>

                    <p
                        className={
                            duplicate
                                ? "text-danger"
                                : "text-text-secondary"
                        }
                    >
                        {labels[record.status]}
                    </p>
                </div>

                {record.data && (
                    <dl className="space-y-1">
                        <div>
                            <dt className="inline text-text-secondary">
                                ტელეფონი:{" "}
                            </dt>
                            <dd className="inline">
                                {record.data.phone}
                            </dd>
                        </div>

                        <div>
                            <dt className="inline text-text-secondary">
                                მისამართი:{" "}
                            </dt>
                            <dd className="inline whitespace-pre-wrap break-words">
                                {record.data.address}
                            </dd>
                        </div>

                        {(
                            record.data.firstName ||
                            record.data.lastName
                        ) && (
                                <div>
                                    <dt className="inline text-text-secondary">
                                        სახელი და გვარი:{" "}
                                    </dt>
                                    <dd className="inline">
                                        {[
                                            record.data.firstName,
                                            record.data.lastName,
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                    </dd>
                                </div>
                            )}
                    </dl>
                )}

                {record.issues.some(
                    issue =>
                        issue.code !== "DUPLICATE_PHONE_IN_IMPORT",
                ) && (
                        <ul className="list-disc space-y-2 pl-5">
                            {record.issues
                                .filter(
                                    issue =>
                                        issue.code !==
                                        "DUPLICATE_PHONE_IN_IMPORT",
                                )
                                .map((issue, index) => (
                                    <li key={index}>
                                        {issue.message}
                                    </li>
                                ))}
                        </ul>
                    )}

                {onEdit && (editingKey === record.key ? (
                    <CustomerRowEditor key={`${record.key}:${JSON.stringify(record.input)}`} record={record}
                        onApply={changes => {
                            onEdit(record.fileId, record.sheetName, record.rowNumber, changes);
                            setEditingKey(null);
                            setEditNotice(`რიგი ${record.rowNumber}: ცვლილება გამოყენებულია. შედეგი განახლებულია.`);
                        }} onCancel={() => setEditingKey(null)} />
                ) : <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setEditingKey(record.key)} className="min-h-11 rounded-xl border border-border px-3">ველების შესწორება</button>
                    {!duplicate && <button type="button" onClick={() => onExcludedChange([...new Set([...excludedKeys, record.key])])} className="min-h-11 rounded-xl border border-danger/40 px-3 text-danger">ამ ჩანაწერის გამოტოვება</button>}
                </div>)}

                {duplicate && !editing && (
                    <div className="flex flex-wrap gap-2">
                        {!onEdit && (
                        <button
                            type="button"
                            onClick={() =>
                                setPhoneEdit({
                                    key: record.key,
                                    value: record.data?.phone ?? "",
                                })
                            }
                            className="min-h-11 rounded-xl border border-border px-3"
                        >
                            ტელეფონის შესწორება
                        </button>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                setPhoneEdit(null);
                                onExcludedChange([
                                    ...new Set([...excludedKeys, record.key]),
                                ]);
                            }}
                            className="min-h-11 rounded-xl border border-danger/40 px-3 text-danger"
                        >
                            იმპორტიდან გამოტოვება
                        </button>
                    </div>
                )}

                {editing && phoneEdit && (
                    <div className="space-y-3 border-t border-border pt-3">
                        <label className="block space-y-1">
                            <span>სწორი ტელეფონის ნომერი</span>

                            <input
                                type="text"
                                inputMode="tel"
                                autoComplete="off"
                                value={phoneEdit.value}
                                onChange={event =>
                                    setPhoneEdit({
                                        key: record.key,
                                        value: event.target.value,
                                    })
                                }
                                className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary"
                            />
                        </label>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    onPhoneChange(
                                        record.fileId,
                                        record.sheetName,
                                        record.rowNumber,
                                        phoneEdit.value,
                                    );
                                    setPhoneEdit(null);
                                }}
                                className="min-h-11 rounded-xl bg-accent px-3 font-semibold text-white"
                            >
                                ცვლილების გამოყენება
                            </button>

                            <button
                                type="button"
                                onClick={() => setPhoneEdit(null)}
                                className="min-h-11 rounded-xl border border-border px-3"
                            >
                                გაუქმება
                            </button>
                        </div>

                        <p className="text-xs text-text-secondary">
                            შეიცვლება მხოლოდ იმპორტის მონაცემები.
                            ნომერს ხელახლა შევამოწმებთ.
                        </p>
                    </div>
                )}
            </article>
        );
    }

    return (
        <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4">
            <div>
                <h2 className="font-semibold">
                    მომხმარებლების საერთო შემოწმება
                </h2>

                <ImportSelectedSheets
                    sources={activeSources}
                    onDisable={onDisableSource}
                />

                <p className="mt-2 text-sm text-text-secondary">
                    მოწმდება ყველა არჩეული ფურცელი,
                    შეტანილი შესწორებების გათვალისწინებით.
                </p>
            </div>

            {editNotice && <p role="status" className="text-sm text-text-secondary">{editNotice}</p>}
            <button
                hidden={autoReview}
                type="button"
                onClick={() => setVisible(current => !current)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm"
            >
                {visible
                    ? "შეჯამების დამალვა"
                    : "საერთო შეჯამების ნახვა"}
            </button>

            {result && (
                <>
                    <p role="status" className="text-sm">
                        სულ: {records.length}.
                        {" "}გამართული: {ready}.
                        {" "}შესასწორებელი: {invalid}.
                        {" "}დუბლიკატზე გადასამოწმებელი: {review}.
                        {" "}გამოტოვებული: {excludedRecords.length}.
                    </p>

                    {result.mappingProblems.map((problem, index) => (
                        <div
                            key={index}
                            className="space-y-2 rounded-xl border border-border p-3 text-sm"
                        >
                            <p className="break-words font-semibold">
                                {problem.fileName}
                                {" / "}
                                {problem.sheetName}
                            </p>

                            <p>{problem.message}</p>

                            <p className="text-text-secondary">
                                ამ ფურცლის ჩანაწერები რაოდენობებში
                                ჯერ არ შედის.
                            </p>
                        </div>
                    ))}

                    {ready > 0 && <button type="button" onClick={() => setShowReady(current => !current)} className="min-h-10 rounded-lg border border-border px-3 text-sm">{showReady ? "გამართული მონაცემების დამალვა" : `გამართული მონაცემების ნახვა (${ready})`}</button>}
                    <div className="max-h-[40rem] space-y-5 overflow-y-auto">
                        {groups.filter(group => showReady || group.length > 1 || group[0].status !== "READY" || group[0].key === editingKey).map(group => {
                            const duplicate = group.length > 1;

                            if (!duplicate) {
                                return (
                                    <div key={group[0].key}>
                                        {renderCard(group[0], false)}
                                    </div>
                                );
                            }

                            return (
                                <section
                                    key={group[0].key}
                                    className="min-w-0 space-y-3"
                                >
                                    <div className="space-y-2 text-sm">
                                        <h3 className="font-semibold text-danger">
                                            ერთი ტელეფონი -{" "}
                                            {group.length} ჩანაწერი
                                        </h3>

                                        <p className="text-text-secondary">
                                            ამ ჩანაწერებს ერთი ნომერი
                                            აქვს. თუ ნომერი შეცდომითაა
                                            მითითებული, შეასწორე შესაბამის
                                            ჩანაწერზე.
                                        </p>

                                        <p className="text-text-secondary">
                                            თუ ჩანაწერის შესწორება არ შეგიძლია,
                                            გამოტოვე მისი იმპორტი.
                                            მისი დაბრუნება ქვემოთ მდებარე
                                            გამოტოვებული ჩანაწერების სიიდან შეგიძლია.
                                            ჩანაწერები ავტომატურად არ გაერთიანდება.
                                        </p>
                                    </div>

                                    <div className="ml-1 border-l-2 border-danger/40 py-1 sm:ml-2">
                                        {group.map(record => (
                                            <div
                                                key={record.key}
                                                className="relative py-2 pl-5 sm:pl-7"
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="absolute left-0 top-8 w-5 border-t-2 border-danger/40 sm:w-7"
                                                />

                                                {renderCard(record, true)}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    {records.length === 0 &&
                        result.mappingProblems.length === 0 && (
                            <p className="text-sm text-text-secondary">
                                მომხმარებლის ჩანაწერები ვერ ვიპოვეთ.
                                გადაამოწმე სათაურების რიგი და სვეტები.
                            </p>
                        )}

                    {excludedRecords.length > 0 && (
                        <section className="space-y-3 border-t border-border pt-4">
                            <h3 className="font-semibold">
                                იმპორტიდან გამოტოვებული მომხმარებლები
                            </h3>

                            <p className="text-sm text-text-secondary">
                                ეს ჩანაწერები მომხმარებლებად არ დაემატება.
                                საწყის ფაილში ინფორმაცია შენარჩუნებულია.
                                თუ მათ შეკვეთები უკავშირდება, მომხმარებელთან
                                დაკავშირება ცალკე იქნება გადასამოწმებელი.
                            </p>

                            <div className="max-h-72 space-y-3 overflow-y-auto">
                                {excludedRecords.map(record => (
                                    <article
                                        key={record.key}
                                        className="space-y-2 rounded-xl border border-border p-3 text-sm"
                                    >
                                        <p className="break-words font-semibold">
                                            {record.fileName}
                                            {" / "}
                                            {record.sheetName}
                                            {" - რიგი "}
                                            {record.rowNumber}
                                        </p>

                                        {record.data && (
                                            <p className="whitespace-pre-wrap break-words text-text-secondary">
                                                {record.data.phone}
                                                {" - "}
                                                {record.data.address}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() =>
                                                onExcludedChange(
                                                    excludedKeys.filter(
                                                        key => key !== record.key,
                                                    ),
                                                )
                                            }
                                            className="min-h-11 rounded-xl border border-border px-3"
                                        >
                                            იმპორტში დაბრუნება
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}

                    <ExistingCustomersCheck
                        autoCheck={autoReview}
                        onChecked={onCustomersChecked}
                        phones={records.flatMap(record =>
                            record.status !== "INVALID" && record.data
                                ? [record.data.phone]
                                : [],
                        )}
                        links={existingLinks}
                        onLinkChange={onExistingLinkChange}
                        onSkipPhone={phone => {
                            const keys = records
                                .filter(record => record.data?.phone === phone)
                                .map(record => record.key);

                            onExcludedChange([
                                ...new Set([...excludedKeys, ...keys]),
                            ]);
                        }}
                    />

                    <p className="text-xs text-text-secondary">
                        მონაცემები ჯერ არ ინახება.
                        არსებული მომხმარებლების მონაცემები
                        ავტომატურად არ იცვლება.
                    </p>
                    <section className="space-y-3 border-t border-border pt-4">
                        <h3 className="font-semibold">
                            მომხმარებლების იმპორტის გეგმა
                        </h3>

                        <div
                            role="status"
                            className="grid gap-3 text-sm sm:grid-cols-3"
                        >
                            <div className="rounded-xl border border-border p-3">
                                <p className="text-text-secondary">
                                    ახალი მომხმარებელი
                                </p>
                                <p className="mt-1 text-xl font-semibold">
                                    {plan.createCount}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border p-3">
                                <p className="text-text-secondary">
                                    არსებულთან დაკავშირება
                                </p>
                                <p className="mt-1 text-xl font-semibold">
                                    {plan.linkCount}
                                </p>
                            </div>

                            <div className="rounded-xl border border-border p-3">
                                <p className="text-text-secondary">
                                    გადასაწყვეტი
                                </p>
                                <p className="mt-1 text-xl font-semibold">
                                    {actionableProblems.length}
                                </p>
                            </div>
                        </div>

                        {result.mappingProblems.length > 0 && (
                            <p className="text-sm text-danger">
                                {result.mappingProblems.length} ფურცელს სვეტების
                                დაკავშირება აკლია. მათი მომხმარებლები გეგმაში
                                ჯერ არ შედის.
                            </p>
                        )}

                        {waitingForCheck.length > 0 && (
                            <p role="status" className="text-sm text-text-secondary">
                                არსებული მომხმარებლების შემოწმება ჯერ არ დასრულებულა.
                                გაუშვი შემოწმება ზემოთ მდებარე ღილაკით.
                                ეს ჩანაწერების შეცდომა არ არის.
                            </p>
                        )}

                        {actionableProblems.length > 0 && (
                            <div className="max-h-80 space-y-3 overflow-y-auto">
                                {actionableProblems.map(item => (
                                    <div
                                        key={item.record.key}
                                        className="space-y-2 rounded-xl border border-danger/40 p-3 text-sm"
                                    >
                                        <p className="break-words font-semibold">
                                            {item.record.fileName}
                                            {" / "}
                                            {item.record.sheetName}
                                            {" - რიგი "}
                                            {item.record.rowNumber}
                                        </p>

                                        <p>{item.reason}</p>

                                        {item.record.data &&
                                            customerCheckSnapshot?.failedPhones.includes(
                                                item.record.data.phone,
                                            ) && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onExcludedChange([
                                                            ...new Set([
                                                                ...excludedKeys,
                                                                item.record.key,
                                                            ]),
                                                        ])
                                                    }
                                                    className="min-h-11 rounded-xl border border-danger/40 px-3 text-danger"
                                                >
                                                    იმპორტიდან გამოტოვება
                                                </button>
                                            )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="text-xs text-text-secondary">
                            გამოტოვებული მომხმარებლები ამ გეგმაში არ შედის.
                            ეს წინასწარი გეგმაა - ბაზაში შენახვა ჯერ არ ხდება.
                            საბოლოო შენახვისას არსებული მონაცემები
                            ხელახლა შემოწმდება.
                        </p>
                    </section>
                </>
            )}
        </section>
    );
}