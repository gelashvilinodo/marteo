"use client";

import type { OrderImportOptions, OrderImportStatusChoice } from "@/lib/imports/order-import-options";
import type { OrderImportNeeds } from "@/lib/imports/get-order-import-needs";

export default function OrderImportOptionsPicker({ value, onChange, needs }: {
    value: OrderImportOptions;
    onChange: (value: OrderImportOptions) => void;
    needs?: OrderImportNeeds;
}) {
    const required = needs ?? { status: true, payment: true, grouping: true, date: true, dateOrder: true, paymentDate: true, unknownStatuses: [] };
    const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-text-primary";
    const statusMap = value.statusMap ?? {};
    const { unknownStatuses, ...questions } = required;
    if (!Object.values(questions).some(Boolean) && unknownStatuses.length === 0) return null;
    return <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        {unknownStatuses.length > 0 && <div className="space-y-3">
            <h2 className="font-semibold">ფაილის სტატუსები</h2>
            <p className="text-sm text-text-secondary">ეს სტატუსები ავტომატურად ვერ ამოვიცანით. აირჩიეთ, რას ნიშნავს თითოეული. არჩევანი ამ სტატუსის მქონე ყველა შეკვეთას შეეხება.</p>
            <div className="grid gap-4 sm:grid-cols-2">
                {unknownStatuses.map(status => <label key={status.key} className="space-y-1 text-sm"><span>„{status.label}“ · {status.orders} შეკვეთა</span>
                    <select value={statusMap[status.key] ?? ""} onChange={event => {
                        const next = { ...statusMap };
                        if (event.target.value) next[status.key] = event.target.value as OrderImportStatusChoice;
                        else delete next[status.key];
                        onChange({ ...value, statusMap: next });
                    }} className={inputClass}>
                        <option value="">აირჩიეთ სტატუსი</option><option value="PROCESSING">დამუშავებაში</option><option value="SHIPPED">გაგზავნილი</option><option value="COMPLETED">დასრულებული</option><option value="SKIP">არ გადმოვიტანო</option>
                    </select>
                </label>)}
            </div>
        </div>}
        {Object.values(questions).some(Boolean) && <>
        <h2 className="font-semibold">ფაილში გამოტოვებული ინფორმაციის შევსება</h2>
        <p className="text-sm text-text-secondary">ეს არჩევანები ყველა შესაბამის შეკვეთას შეეხება. ფაილში არსებულ მონაცემებს არ გადაწერს და სათითაოდ შევსება არ დაგჭირდებათ.</p>
        <div className="grid gap-4 sm:grid-cols-2">
            {required.status && <label className="space-y-1 text-sm"><span>სტატუსის გარეშე შეკვეთები</span>
                <select value={value.missingStatus} onChange={event => onChange({ ...value, missingStatus: event.target.value as OrderImportOptions["missingStatus"] })} className={inputClass}>
                    <option value="UNRESOLVED">აირჩიეთ სტატუსი</option><option value="COMPLETED">დასრულებული</option><option value="PROCESSING">დამუშავებაში</option>
                </select>
                {value.missingStatus === "COMPLETED" && <span className="block text-xs text-text-secondary">დასრულებული ნიშნავს, რომ შეკვეთა შესრულებულია და სრულად გადახდილია. გადახდის ინფორმაცია ამას უნდა შეესაბამებოდეს.</span>}
            </label>}
            {required.payment && <label className="space-y-1 text-sm"><span>თუ გადახდის ინფორმაცია არ წერია</span>
                <select value={value.missingPayment} onChange={event => onChange({ ...value, missingPayment: event.target.value as OrderImportOptions["missingPayment"] })} className={inputClass}>
                    <option value="UNRESOLVED">დაუზუსტებელი დარჩეს</option><option value="PAID">ყველა სრულად გადახდილია</option><option value="UNPAID">ყველა გადაუხდელია</option>
                </select>
            </label>}
            {required.grouping && <label className="space-y-1 text-sm"><span>კოდის გარეშე როგორ დავაჯგუფოთ?</span>
                <select value={value.grouping} onChange={event => onChange({ ...value, grouping: event.target.value as OrderImportOptions["grouping"] })} className={inputClass}>
                    <option value="UNRESOLVED">აირჩიეთ დაჯგუფება</option><option value="EACH_ROW">თითოეული რიგი ცალკე შეკვეთაა</option><option value="PHONE_AND_DATE">ტელეფონისა და თარიღის მიხედვით</option>
                </select>
                {value.grouping === "PHONE_AND_DATE" && <span className="block text-xs text-text-secondary">დაჯგუფების შედეგს ცალკე გაჩვენებთ და შენახვამდე დადასტურებას მოგთხოვთ.</span>}
            </label>}
            {required.date && <label className="space-y-1 text-sm"><span>საერთო თარიღი უთარიღო შეკვეთებისთვის</span>
                <input type="date" value={value.fallbackDate ?? ""} onChange={event => onChange({ ...value, fallbackDate: event.target.value || null })} className={inputClass} />
                <span className="block text-xs text-text-secondary">სხვადასხვა თარიღის მითითება რიგების შესწორებიდანაც შეგიძლიათ.</span>
            </label>}
            {required.dateOrder && <label className="space-y-1 text-sm"><span>თარიღებში ჯერ დღე წერია თუ თვე?</span>
                <select value={value.dateOrder ?? ""} onChange={event => onChange({ ...value, dateOrder: event.target.value === "DMY" ? "DMY" : event.target.value === "MDY" ? "MDY" : null })} className={inputClass}>
                    <option value="">აირჩიეთ ფორმატი</option><option value="DMY">დღე / თვე / წელი</option><option value="MDY">თვე / დღე / წელი</option>
                </select>
            </label>}
            {required.paymentDate && <label className="space-y-1 text-sm"><span>უთარიღო გადახდების მიღების თარიღი</span>
                <select value={value.paymentDateMode} onChange={event => onChange({ ...value, paymentDateMode: event.target.value as OrderImportOptions["paymentDateMode"] })} className={inputClass}>
                    <option value="UNRESOLVED">აირჩიეთ მიღების თარიღის წესი</option><option value="ORDER_DATE">შესაბამისი შეკვეთის დღეს მივიღე</option><option value="COMMON_DATE">ყველასთვის საერთო თარიღი</option>
                </select>
                {value.paymentDateMode === "COMMON_DATE" && <input aria-label="გადახდების საერთო მიღების თარიღი" type="date" value={value.fallbackPaymentDate ?? ""} onChange={event => onChange({ ...value, fallbackPaymentDate: event.target.value || null })} className={inputClass} />}
                <span className="block text-xs text-text-secondary">ფაილში უკვე მითითებულ მიღების თარიღებს არ შეცვლის.</span>
            </label>}
        </div>
        </>}
    </section>;
}
