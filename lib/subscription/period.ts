// გადახდის პერიოდი: შემდეგი გადახდა იმავე რიცხვში და საათზე, თვეში ასეთი რიცხვი თუ არ არის — ბოლო დღეს.
// 31 იანვარს ნაყიდი გეგმა თებერვალში 28/29-ში ჩამოიჭრება, მარტში კი ისევ 31-ში (ათვლა პირველი გადახდიდან).
export function addBillingMonths(anchor: Date, months: number) {
    const year = anchor.getUTCFullYear(), month = anchor.getUTCMonth() + months, day = anchor.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const result = new Date(anchor);
    result.setUTCFullYear(year, month, Math.min(day, lastDay));
    return result;
}
