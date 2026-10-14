// OpenNext 1.20.6 assumes package exports/imports are objects. Node also allows
// a string target. Keep that target intact rather than throwing while copying.
const fs = require("node:fs");
const path = "node_modules/@opennextjs/cloudflare/dist/cli/build/utils/workerd.js";
const marker = "    // MARTEO: package exports can be a string target.\n";
const source = fs.readFileSync(path, "utf8");
if (!source.includes(marker)) {
    const anchor = "export function transformBuildCondition(conditionMap, condition) {\n";
    if (!source.includes(anchor)) {
        throw new Error("OpenNext changed: review the workerd compatibility patch before building.");
    }
    fs.writeFileSync(path, source.replace(anchor, anchor + marker +
        "    if (typeof conditionMap !== 'object' || conditionMap === null) {\n" +
        "        return { transformedExports: conditionMap, hasBuildCondition: false };\n" +
        "    }\n"));
}
console.log("OpenNext package exports compatibility checked.");
