import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

// RFC 6238 (TOTP): 6 ციფრი, 30 წამი, SHA-1 — ამას ყველა კოდის აპი (Google Authenticator, Apple Passwords) ელის.
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
    let bits = 0, value = 0, out = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(text: string) {
    const clean = text.replace(/[\s=]/g, "").toUpperCase();
    let bits = 0, value = 0;
    const out: number[] = [];
    for (const char of clean) {
        const index = ALPHABET.indexOf(char);
        if (index < 0) throw new Error("Invalid base32");
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Buffer.from(out);
}

export function newTotpSecret() {
    return base32Encode(randomBytes(20));
}

export function currentStep(now = Date.now()) {
    return Math.floor(now / 1000 / STEP_SECONDS);
}

export function totpAt(secret: string, step: number) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
    return code.toString().padStart(DIGITS, "0");
}

/**
 * Returns the matched step (±1 step for clock drift) or null. A step at or below lastStep is refused,
 * so a code seen over someone's shoulder cannot be used a second time.
 */
export function matchTotp(secret: string, code: string, lastStep: number, now = Date.now()) {
    if (!/^\d{6}$/.test(code)) return null;
    const step = currentStep(now);
    for (const candidate of [step, step - 1, step + 1]) {
        if (candidate <= lastStep) continue;
        const expected = Buffer.from(totpAt(secret, candidate));
        if (timingSafeEqual(expected, Buffer.from(code))) return candidate;
    }
    return null;
}

export function otpauthUri(secret: string, account: string) {
    const label = encodeURIComponent(`MARTEO Admin:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("MARTEO Admin")}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// სარეზერვო კოდი: 10 სიმბოლო ორ ნაწილად (xxxxx-xxxxx), მხოლოდ ადვილად წასაკითხი ასოები და ციფრები.
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newBackupCodes(count = 10) {
    return Array.from({ length: count }, () => {
        const bytes = randomBytes(10);
        const chars = Array.from(bytes, byte => BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length]).join("");
        return `${chars.slice(0, 5)}-${chars.slice(5)}`;
    });
}

export function normalizeBackupCode(code: string) {
    return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashBackupCode(code: string) {
    return createHash("sha256").update(`marteo-admin-backup:${normalizeBackupCode(code)}`).digest("hex");
}
