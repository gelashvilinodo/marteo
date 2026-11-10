// თარიღი და დრო თბილისის დროით, ფორმატით "10.11.2026, 03:30".
// Intl.DateTimeFormat("ka-GE") სერვერზე (Node) და ბრაუზერში სხვადასხვა გამყოფს იძლევა ("." / "/"),
// რაც კლიენტის კომპონენტში React-ის hydration შეცდომას იწვევს. აქ ნაწილები თავად ეწყობა, ამიტომ შედეგი ყველგან ერთია.
const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

export function formatTbilisiDateTime(value: Date | string): string {
    const map = Object.fromEntries(parts.formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return `${map.day}.${map.month}.${map.year}, ${map.hour}:${map.minute}`;
}
