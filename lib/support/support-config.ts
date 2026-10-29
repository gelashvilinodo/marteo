// Shared by the browser and the server; keep it free of server-only imports.
import { MARTEO_CONTACTS } from "@/lib/marteo-contacts";

export const SUPPORT_MESSAGE_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;
export const SUPPORT_POLL_MS = 3000;

export const SUPPORT_WELCOME_TEXT = "გამარჯობა! 👋 მართეოს მხარდაჭერის გუნდი გისმენთ. რით შეგვიძლია დაგეხმაროთ?";

export type SupportChannel = { id: string; label: string; hint: string; icon: string; href: string };

export const SUPPORT_CHANNELS: SupportChannel[] = [
    { id: "instagram", label: "Instagram", hint: "პირდაპირი შეტყობინება", icon: "skill-icons:instagram", href: MARTEO_CONTACTS.instagramChat },
    { id: "messenger", label: "Messenger", hint: "Facebook-ით მოგვწერე", icon: "logos:messenger", href: MARTEO_CONTACTS.messengerChat },
    { id: "email", label: "ელ-ფოსტა", hint: MARTEO_CONTACTS.email, icon: "solar:letter-bold-duotone", href: `mailto:${MARTEO_CONTACTS.email}` },
];

export type SupportMessageView = {
    id: string;
    sender: "USER" | "ADMIN";
    body: string;
    createdAt: string;
    author: { name: string; avatarUrl: string | null } | null;
};

export type SupportThreadView = {
    conversationId: string | null;
    status: "OPEN" | "CLOSED";
    adminReadAt: string | null;
    userReadAt: string | null;
    messages: SupportMessageView[];
};

// Formatted by hand: server and browser ICU data disagree on Georgian names,
// which breaks hydration.
const MONTHS = ["იან.", "თებ.", "მარ.", "აპრ.", "მაი.", "ივნ.", "ივლ.", "აგვ.", "სექ.", "ოქტ.", "ნოე.", "დეკ."];
const tbilisiParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parts(iso: string) {
    const values = Object.fromEntries(tbilisiParts.formatToParts(new Date(iso)).map(part => [part.type, part.value]));
    return { year: values.year, month: Number(values.month), day: Number(values.day), time: `${values.hour}:${values.minute}` };
}

export function formatSupportDate(iso: string) {
    const { year, month, day } = parts(iso);
    return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatSupportTime(iso: string) {
    return parts(iso).time;
}

export function formatSupportCount(value: number) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
