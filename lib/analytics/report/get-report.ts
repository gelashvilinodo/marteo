import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { getAnalyticsPage } from '../get-analytics-page';
import { getExpenseBreakdown } from '../get-expense-breakdown';
import { resolveOrdersPeriod } from '@/lib/orders/orders-period';
import type { AccountantReport, ReportSection } from './types';
export class ReportError extends Error { constructor(message: string, public status = 422) { super(message); } }
const MAX = 10000;
export async function getAccountantReport(tx: Prisma.TransactionClient, businessId: string, params: URLSearchParams): Promise<AccountantReport> {
    const range = resolveOrdersPeriod('custom', params.get('from') ?? '', params.get('to') ?? '');
    if (range.error) throw new ReportError('მიუთითე სწორი საწყისი და საბოლოო თარიღი.');
    const dates = { gte: range.start, lt: range.end };
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true } });
    const data = await getAnalyticsPage(tx, businessId, { period: 'custom', from: range.from, to: range.to });
    const expenses = await getExpenseBreakdown(tx, businessId, range.from, range.to);
    // Never truncate a financial report silently. Each ledger is bounded independently.
    const entries = await tx.orderFinancialEntry.findMany({ where: { businessId, occurredAt: dates }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: MAX + 1, include: { items: true, order: { select: { analyticsPendingCost: true } } } });
    const purchases = await tx.purchase.findMany({ where: { businessId, purchaseDate: dates }, orderBy: [{ purchaseDate: 'asc' }, { number: 'asc' }], take: MAX + 1, include: { items: true } });
    const materials = await tx.materialPurchase.findMany({ where: { businessId, deletedAt: null, purchaseDate: dates }, orderBy: [{ purchaseDate: 'asc' }, { number: 'asc' }], take: MAX + 1, include: { items: true } });
    const productions = await tx.production.findMany({ where: { businessId, productionDate: dates }, orderBy: [{ productionDate: 'asc' }, { number: 'asc' }], take: MAX + 1, include: { outputs: true } });
    const payments = await tx.orderPayment.findMany({ where: { order: { businessId }, createdAt: dates }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX + 1, include: { order: { select: { number: true, analyticsPendingCost: true } } } });
    const writeOffs = await tx.inventoryWriteOff.findMany({ where: { businessId, createdAt: dates }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX + 1 });
    const expenseRows = await tx.expense.findMany({ where: { businessId, expenseDate: dates }, orderBy: [{ expenseDate: 'asc' }, { id: 'asc' }], take: MAX + 1 });
    if ([entries, purchases, materials, productions, expenseRows, payments, writeOffs].some(rows => rows.length > MAX)) throw new ReportError('ანგარიში ძალიან დიდია. აირჩიე მოკლე პერიოდი (ერთ განყოფილებაში მაქსიმუმ 10 000 ჩანაწერი).');
    const money = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v).toFixed(2) + ' ₾';
    const date = (v: Date) => new Intl.DateTimeFormat('ka-GE', { timeZone: 'Asia/Tbilisi', dateStyle: 'short' }).format(v);
    const gross = data.profitReady ? new Prisma.Decimal(data.sales).minus(data.costOfGoods) : null;
    const warnings = [
        'ანგარიში ეფუძნება მართეოში აღრიცხულ მონაცემებს. ეს არ არის საგადასახადო დეკლარაცია. გადასახადები ავტომატურად არ გამოითვლება; ხელით აღრიცხული გადასახადი სხვა ხარჯებში შედის.',
        'კურიერის გამავალი/შემომავალი თანხები გაყიდვებისა და მოგების გამოთვლაში არ შედის. შესყიდვისა და წარმოების ღირებულება ცალკე საინფორმაციოდ არის ნაჩვენები და მოგებას მეორედ არ აკლდება.',
    ];
    if (!data.profitReady) warnings.push(`მოგება დაუზუსტებელია: არასრული ფინანსური ჩანაწერები — ${data.incompleteEntries}; თვითღირებულების მოლოდინში მყოფი შეკვეთები ბიზნესში — ${data.pendingCostOrders}; გაყიდვის ჩანაწერის გარეშე დასრულებული შეკვეთები ბიზნესში — ${data.unrecordedCompleted}. დაუზუსტებელი შეკვეთების ნაწილი ანალიტიკის ჯამებში არ შედის.`);
    if (purchases.some(p => !p.country)) warnings.push('ზოგ პროდუქტების შესყიდვაზე იმპორტის ქვეყანა მითითებული არ არის. მისი დამატება პარტიის რედაქტირებიდან შეგიძლია.');
    const kinds = { SALE: 'გაყიდვა', RETURN: 'დაბრუნება', EXCHANGE_ADJUSTMENT: 'გაცვლა / შესწორება', COST_ADJUSTMENT: 'თვითღირებულების დაზუსტება' };
    const sections: ReportSection[] = [
        { title: 'ფინანსური შეჯამება', columns: ['მაჩვენებელი', 'თანხა'], rows: [
            ['გაყიდვები (დაბრუნებებისა და შესწორებების შემდეგ)', money(data.sales)], ['გაყიდულის თვითღირებულება', money(data.costOfGoods)],
            ['მთლიანი მოგება', gross ? money(gross) : 'დასაზუსტებელია'], ['სხვა აღრიცხული ხარჯები და ჩამოწერა', money(data.recordedExpenses)], ['სუფთა მოგება (აღრიცხული ხარჯებით)', data.profit === null ? 'დასაზუსტებელია' : money(data.profit)],
            ['მიღებული თანხა', money(data.received)], ['რეალურად დაბრუნებული თანხა', money(data.refunded)], ['მიღებული − დაბრუნებული', money(data.netReceived)],
            ['ფინანსური გაყიდვის ჩანაწერები', String(entries.filter(e => e.kind === 'SALE' && !e.order?.analyticsPendingCost).length)], ['დაბრუნების ჩანაწერები', String(entries.filter(e => e.kind === 'RETURN' && !e.order?.analyticsPendingCost).length)],
        ], note: 'გადახდები ფულის მოძრაობაა და გაყიდვების ტოლფასი არ არის. რაოდენობები ფინანსური მოვლენების რაოდენობას აღნიშნავს, არა ნივთების რაოდენობას.' },
        { title: 'ხარჯები კატეგორიებით', columns: ['კატეგორია', 'თანხა'], rows: expenses.segments.filter(s => s.id !== 'COGS').map(s => [s.label, money(s.amount)]) },
        { title: 'გადახდები და თანხის დაბრუნება', columns: ['თარიღი / შეკვეთა', 'მეთოდი', 'თანხა', 'შენიშვნა'], rows: payments.map(p => [date(p.createdAt) + ' · #' + (p.order.number ?? '—'), p.method === 'CASH' ? 'ნაღდი' : 'ბარათი / გადარიცხვა', money(p.amount), p.order.analyticsPendingCost ? 'ანალიტიკის ჯამიდან გამოტოვებულია' : p.amount.isNegative() ? 'თანხის დაბრუნება' : 'თანხის მიღება']), note: 'ფაქტობრივად აღრიცხული გადახდები შესაძლოა მოიცავდეს მიწოდების თანხასაც. გაყიდვებსა და მოგებას ცალკე არ ემატება.' },
        { title: 'მარაგის ჩამოწერა', columns: ['თარიღი', 'დასახელება', 'რაოდენობა', 'ხარჯი'], rows: writeOffs.map(w => [date(w.createdAt), [w.name, w.color, w.size].filter(Boolean).join(' · '), String(w.quantity), w.totalCost === null ? 'დასაზუსტებელია' : money(w.totalCost)]) },
        { title: 'გაყიდვები, დაბრუნებები და შესწორებები', columns: ['თარიღი / შეკვეთა', 'მოქმედება', 'გაყიდვის ცვლილება', 'თვითღირებულება', 'შენიშვნა'], rows: entries.map(e => [date(e.occurredAt) + ' · #' + (e.orderNumber ?? '—'), kinds[e.kind], money(e.productRevenueDelta), e.costComplete ? money(e.costOfGoodsDelta) : 'დასაზუსტებელია', [e.order?.analyticsPendingCost ? 'ანალიტიკის ჯამიდან გამოტოვებულია' : e.costComplete ? '' : 'მოგება არასრულია', ...e.items.map(i => i.name + ': ' + i.quantityDelta.toString())].filter(Boolean).join(' · ')]) },
        { title: 'პროდუქტების შესყიდვები', columns: ['თარიღი / პარტია', 'სახელი / ქვეყანა', 'საქონელი', 'ტრანსპ. / განბაჟება / სხვა', 'სულ / მდგომარეობა'], rows: purchases.map(p => { const goods = p.items.reduce((s, i) => s.plus(i.unitPurchasePrice.mul(i.quantity)), new Prisma.Decimal(0)); return [date(p.purchaseDate) + ' · #' + p.number, [p.name, p.country || 'ქვეყანა უცნობია'].filter(Boolean).join(' · '), money(goods), [p.shippingCost, p.customsCost, p.otherCost].map(money).join(' / '), money(goods.plus(p.shippingCost).plus(p.customsCost).plus(p.otherCost)) + ' · ' + (p.receiptStatus === 'RECEIVED' ? 'ჩამოსული' : 'გზაში')]; }) },
        { title: 'მასალების შესყიდვები', columns: ['თარიღი / პარტია', 'სახელი / ქვეყანა', 'საქონელი', 'ტრანსპ. / განბაჟება / სხვა', 'სულ / მდგომარეობა'], rows: materials.map(p => { const goods = p.items.reduce((s, i) => s.plus(i.unitPurchasePrice.mul(i.quantity)), new Prisma.Decimal(0)); return [date(p.purchaseDate) + ' · #' + p.number, [p.name, p.country || 'ქვეყანა უცნობია'].filter(Boolean).join(' · '), money(goods), [p.shippingCost, p.customsCost, p.otherCost].map(money).join(' / '), money(goods.plus(p.shippingCost).plus(p.customsCost).plus(p.otherCost)) + ' · ' + (p.receiptStatus === 'RECEIVED' ? 'ჩამოსული' : 'გზაში')]; }) },
        { title: 'წარმოება', columns: ['თარიღი / წარმოება', 'სახელი / სტატუსი', 'მასალების ხარჯი', 'სავარაუდო დანამატი', 'სრული ღირებულება'], rows: productions.map(p => [date(p.productionDate) + ' · #' + p.number, (p.name || 'წარმოება') + ' · ' + (p.status === 'COMPLETED' ? 'დასრულებული' : 'მიმდინარე'), money(p.materialsCost), money(p.overheadCost), money(p.totalCost)]), note: 'წარმოება შერჩეულია წარმოების თარიღით. სავარაუდო დანამატი დაუზუსტებელი საწარმოო ხარჯია. სრული ღირებულება დამატებით პირდაპირ ხარჯებსაც მოიცავს.' },
        { title: 'აღრიცხული ხარჯების დეტალები', columns: ['თარიღი', 'დასახელება', 'შენიშვნა', 'თანხა'], rows: expenseRows.map(e => [date(e.expenseDate), e.title || expenses.segments.find(s => s.id === e.category)?.label || e.category, e.note || '', money(e.amount)]) },
    ];
    return { businessName: business.name, from: range.from, to: range.to, createdAt: new Date().toISOString(), warnings, highlights: [
        { label: 'გაყიდვები', value: money(data.sales), description: 'დაბრუნებებისა და შესწორებების შემდეგ' },
        { label: 'მთლიანი მოგება', value: gross ? money(gross) : 'დასაზუსტებელია', description: 'გაყიდვები − გაყიდულის თვითღირებულება' },
        { label: 'სუფთა მოგება', value: data.profit === null ? 'დასაზუსტებელია' : money(data.profit), description: 'მთლიანი მოგება − სხვა აღრიცხული ხარჯები' },
    ], sections };
}
