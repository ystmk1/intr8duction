"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";

type Status = "idle" | "submitting" | "done" | "error";

export function JoinForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("submit failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <main className="join-shell join-complete">
        <Image src="/logo_white.svg" alt="cre8" width={120} height={120} priority />
        <p>접수 완료</p>
      </main>
    );
  }

  return (
    <main className="join-shell">
      <Image
        className="join-logo"
        src="/logo_white.svg"
        alt="cre8"
        width={72}
        height={72}
        priority
      />

      <form className="join-form" onSubmit={handleSubmit}>
        <label>
          <span>이름</span>
          <input name="name" autoComplete="name" maxLength={24} required />
        </label>

        <div className="join-row">
          <label>
            <span>학번</span>
            <input
              name="studentId"
              inputMode="numeric"
              pattern="[0-9]{2}"
              maxLength={2}
              required
            />
          </label>
          <label>
            <span>전공</span>
            <input name="major" maxLength={60} required />
          </label>
        </div>

        <label>
          <span>세부전공</span>
          <input name="subMajor" maxLength={60} />
        </label>

        <label>
          <span>작업 관심사</span>
          <textarea name="workInterest" maxLength={180} rows={3} />
        </label>

        <label>
          <span>개인 관심사</span>
          <textarea name="personalInterest" maxLength={180} rows={3} />
        </label>

        <label>
          <span>하고 싶은 말</span>
          <textarea name="message" maxLength={240} rows={3} />
        </label>

        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "제출 중" : "제출"}
        </button>

        {status === "error" && (
          <p className="form-error" role="alert">
            다시 시도해 주세요.
          </p>
        )}
      </form>
    </main>
  );
}
