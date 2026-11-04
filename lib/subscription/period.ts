// გადახდის პერიოდი: შემდეგი გადახდა იმავე რიცხვში და საათზე, თვეში ასეთი რიცხვი თუ არ არის — ბოლო დღეს.
// 31 იანვარს ნაყიდი გეგმა თებერვალში 28/29-ში ჩამოიჭრება, მარტში კი ისევ 31-ში (ათვლა პირველი გადახდიდან).
export function addBillingMonths(anchor: Date, months: number) {
    const year = anchor.getUTCFullYear(), month = anchor.getUTCMonth() + months, day = anchor.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const result = new Date(anchor);
    result.setUTCFullYear(year, month, Math.min(day, lastDay));
    return result;
}

// მიმდინარე თვიური პერიოდი ლიმიტებისთვის. რამდენიმე თვის გადახდისას (ადმინის ჩაწერილი 3/6/12 თვე)
// ან ვადის გაგრძელებისას ათვლა ყოველ თვეს თავიდან იწყება, ოღონდ გეგმის ვადას არ სცდება.
export function currentMonthlyPeriod(anchor: Date, expiresAt: Date | null, now = new Date()) {
    let start = anchor;
    for (let months = 1; months <= 240; months++) {
        const next = addBillingMonths(anchor, months);
        if (next > now || (expiresAt && next >= expiresAt)) break;
        start = next;
    }
    const monthEnd = addBillingMonths(start, 1);
    const end = expiresAt && expiresAt < monthEnd ? expiresAt : monthEnd;
    return { start, end };
}
