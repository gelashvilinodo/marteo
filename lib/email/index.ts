import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const appUrl = process.env.APP_URL;

    if (!appUrl) {
        throw new Error("APP_URL is not configured");
    }

    if (!process.env.RESEND_FROM_EMAIL) {
        throw new Error("RESEND_FROM_EMAIL is not configured");
    }

    const verificationUrl =
        `${appUrl}/verify-email?userId=${encodeURIComponent(
            userId
        )}&token=${encodeURIComponent(token)}`;

    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
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