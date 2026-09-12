export type SendSmsParams = {
  phone: string;
  message: string;
};

export async function sendSms({
  phone,
  message,
}: SendSmsParams): Promise<void> {
  /*
   * SMS provider-ს მოგვიანებით აქ ჩავამატებთ.
   *
   * მაგალითად:
   * - Verify.ge
   * - GOSMS.GE
   * - სხვა provider
   *
   * ამ ეტაპზე რეალურ SMS-ს არ ვაგზავნით.
   */

  console.log("SMS placeholder:", {
    phone,
    message,
  });
}