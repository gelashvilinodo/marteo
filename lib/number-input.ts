// რიცხვითი ველების აკრეფის გამწმენდები: ასოები და ზედმეტი სიმბოლოები არ გაივლის,
// მძიმე წერტილად იქცევა და წინა ნულები ("06") ქრება.

export function decimalInput(value: string, decimals = 2): string {
    let text = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const dot = text.indexOf(".");
    if (dot !== -1) {
        text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
    }
    if (text.startsWith(".")) text = `0${text}`;
    return text.replace(/^0+(?=\d)/, "");
}

export function integerInput(value: string): string {
    return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}
