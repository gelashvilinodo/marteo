import { Resend } from "resend";

type SendVerificationEmailParams = {
  to: string;
  firstName: string;
  token: string;
};

export async function sendVerificationEmail({
  to,
  firstName,
  token,
}: SendVerificationEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject: "MARTEO — ელფოსტის დადასტურება",
    html: `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>მოგესალმებით MARTEO-ში, ${firstName}!</h2>

    <p>
      თქვენი ელფოსტის დასადასტურებელი კოდია:
    </p>

    <div
      style="
        margin: 24px 0;
        padding: 18px 24px;
        background: #0F1C2E;
        color: #ffffff;
        font-size: 32px;
        font-weight: 700;
        letter-spacing: 10px;
        text-align: center;
        border-radius: 10px;
      "
    >
      ${token}
    </div>

    <p>
      ჩაწერეთ ეს 6-ნიშნა კოდი MARTEO-ში.
    </p>

    <p>
      კოდი მოქმედებს 10 წუთის განმავლობაში.
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