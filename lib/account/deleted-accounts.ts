import "server-only";
import { createHash } from "crypto";

// წაშლილი ანგარიშის ელფოსტა/ტელეფონი მხოლოდ ჰეშად ინახება: ბაზიდან მისამართს ვერავინ აღადგენს,
// მაგრამ იგივე მისამართით ხელახლა დარეგისტრირებისას დამთხვევა ჩანს.
export const accountEmailHash = (email: string) => createHash("sha256").update(`marteo-deleted-email:${email.trim().toLowerCase()}`).digest("hex");
export const accountPhoneHash = (phone: string) => createHash("sha256").update(`marteo-deleted-phone:${phone.replace(/\s/g, "")}`).digest("hex");
