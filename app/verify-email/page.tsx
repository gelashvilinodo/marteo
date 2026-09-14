"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();

  const userId = searchParams.get("userId");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "success" | "error"
  >("loading");

  const [message, setMessage] = useState("");

  useEffect(() => {
    async function verifyEmail() {
      if (!userId || !token) {
        setStatus("error");
        setMessage("ვერიფიკაციის ბმული არასწორია ან არასრულია.");
        return;
      }

      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            token,
          }),
        });

        const data = (await response.json()) as {
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setStatus("error");
          setMessage(
            data.error || "ელფოსტის ვერიფიკაცია ვერ მოხერხდა."
          );
          return;
        }

        setStatus("success");
        setMessage(
          data.message || "ელფოსტა წარმატებით დადასტურდა."
        );
      } catch {
        setStatus("error");
        setMessage(
          "დაფიქსირდა შეცდომა. გთხოვთ, სცადოთ თავიდან."
        );
      }
    }

    verifyEmail();
  }, [userId, token]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-8 text-center shadow-sm">
        {status === "loading" && (
          <>
            <h1 className="text-2xl font-semibold text-text-primary">
              ელფოსტის დადასტურება
            </h1>

            <p className="mt-3 text-text-secondary">
              გთხოვთ, დაელოდოთ...
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-2xl font-semibold text-text-primary">
              ელფოსტა დადასტურებულია
            </h1>

            <p className="mt-3 text-text-secondary">
              {message}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-semibold text-text-primary">
              ვერიფიკაცია ვერ მოხერხდა
            </h1>

            <p className="mt-3 text-text-secondary">
              {message}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}