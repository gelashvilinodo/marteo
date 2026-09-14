import { Resend } from "resend";

type SendVerificationEmailParams = {
  to: string;
  firstName: string;
  token: string;
  userId: string;
};

export async function sendVerificationEmail({
  to,
  firstName,
  token,
  userId,
}: SendVerificationEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.APP_URL;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!appUrl) {
    throw new Error("APP_URL is not configured");
  }

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const resend = new Resend(apiKey);

  const verificationUrl =
    `${appUrl}/verify-email?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject: "MARTEO — ელფოსტის დადასტურება",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>მოგესალმებით MARTEO-ში, ${firstName}!</h2>

        <p>
          თქვენი ანგარიშის გასააქტიურებლად დაადასტურეთ ელფოსტის მისამართი.
        </p>

        <p>
          <a
            href="${verificationUrl}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #0F1C2E;
              color: #ffffff;
              text-decoration: none;
              border-radius: 8px;
            "
          >
            ელფოსტის დადასტურება
          </a>
        </p>

        <p>
          ბმული მოქმედებს 15 წუთის განმავლობაში.
        </p>

        <p>MARTEO.GE</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}