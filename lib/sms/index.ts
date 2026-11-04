import { normalizePhone, isAllowedSmsPhone } from "@/lib/security/phone";
import { reserveDelivery, reserveOrderSms } from "@/lib/security/delivery-limit";

type SendSmsParams = {
  phone: string;
  message: string;
  // verification: კოდის SMS მკაცრი ლიმიტით. order: მომხმარებლის შეტყობინება, რომელსაც ბიზნესის
  // SMS ბალანსი უკვე ზღუდავს, ამიტომ მხოლოდ თითო ნომერზე და დღიური საერთო ზღვარი აქვს.
  purpose?: "verification" | "order";
};

type SendSmsResponse = {
  Success?: boolean;
  Message?: string;
  Output?: {
    sms?: string;
    sent?: number;
    segments?: number;
    cost?: number;
  };
  ErrorCode?: number;
};

export async function sendSms({
  phone,
  message,
  purpose = "verification",
}: SendSmsParams): Promise<void> {
  phone = normalizePhone(phone);
  if (!isAllowedSmsPhone(phone)) throw new Error("Unsupported SMS phone number");
  const apiKey = process.env.SENDSMS_API_KEY;
  const baseUrl =
    process.env.SENDSMS_BASE_URL || "https://sendsms.ge/api";
  const sender = process.env.SENDSMS_SENDER;

  if (!apiKey) {
    throw new Error("SENDSMS_API_KEY is not configured");
  }

  if (!sender) {
    throw new Error("SENDSMS_SENDER is not configured");
  }

  const params = new URLSearchParams({
    key: apiKey,
    destination: phone,
    sender,
    content: message,
    contentType: "1",
  });

  if (purpose === "order") await reserveOrderSms(phone);
  else await reserveDelivery("sms", phone);

  const response = await fetch(`${baseUrl}/v2/send?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = (await response.json()) as SendSmsResponse;

  if (!response.ok || data.Success !== true) {
    throw new Error(
      data.Message || "SMS sending failed"
    );
  }
}