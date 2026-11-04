// ბილდის დროს ამოწმებს, რომ ბიზნესის ყველა API როუტი და დაშბორდის გვერდი
// წევრის უფლებას ამოწმებს. ახალი როუტი შემოწმების გარეშე ბილდს ვერ გაივლის.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

// ბიზნესზე დამოუკიდებელი როუტები: ანგარიში, პროფილი, პლატფორმის ადმინი,
// ახალი ბიზნესის შექმნა და ბიზნესებს შორის გადართვა.
const EXEMPT_API = [
    "app/api/admin/", "app/api/auth/", "app/api/profile/", "app/api/push/",
    "app/api/business/onboarding/", "app/api/business/switch/", "app/api/business/upload-logo/",
    // მოწვევის ბმული: წვდომას ტოკენი განსაზღვრავს.
    "app/api/invites/",
    // საათობრივი cron: წვდომას CRON_SECRET განსაზღვრავს.
    "app/api/cron/",
];

function walk(dir, name) {
    const found = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) found.push(...walk(path, name));
        else if (entry === name) found.push(path);
    }
    return found;
}

const problems = [];

for (const file of walk(join(root, "app/api"), "route.ts")) {
    const path = relative(root, file);
    if (EXEMPT_API.some(prefix => path.startsWith(prefix))) continue;
    const source = readFileSync(file, "utf8");
    if (/^export \{ [A-Z, ]+ \} from "\.\.?\//m.test(source) && !/export (async )?function|export const (GET|POST|PUT|PATCH|DELETE)/.test(source)) continue;
    const handlers = source.match(/export (?:async function|function|const) (?:GET|POST|PUT|PATCH|DELETE)\b/g)?.length ?? 0;
    const checks = source.match(/await apiAccessDenied\(/g)?.length ?? 0;
    // costs ერთ საერთო handle ფუნქციაში ამოწმებს ორივე მეთოდს.
    if (checks === 0 || (checks < handlers && !/=> handle\(/.test(source))) {
        problems.push(`${path}: ${handlers} handler(s), ${checks} apiAccessDenied check(s)`);
    }
}

for (const file of ["app/dashboard", "app/print"].flatMap(dir => walk(join(root, dir), "page.tsx"))) {
    const source = readFileSync(file, "utf8");
    if (!/await (requireDashboardSection|requirePageAccess)\(/.test(source)) {
        problems.push(`${relative(root, file)}: missing requireDashboardSection/requirePageAccess`);
    }
}

if (problems.length) {
    console.error("Business access check failed:\n" + problems.map(line => `  - ${line}`).join("\n"));
    process.exit(1);
}
console.log("Business access check passed.");
