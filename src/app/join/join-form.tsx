"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useState } from "react";

type Status = "idle" | "submitting" | "done" | "error";

export function JoinForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [photoCount, setPhotoCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);

    if (files.length > 2) {
      event.currentTarget.value = "";
      setPhotoCount(0);
      setErrorMessage("사진은 2장까지 선택할 수 있습니다.");
      return;
    }

    const oversized = files.some((file) => file.size > 5 * 1024 * 1024);
    if (oversized) {
      event.currentTarget.value = "";
      setPhotoCount(0);
      setErrorMessage("사진 한 장은 5MB 이하여야 합니다.");
      return;
    }

    setPhotoCount(files.length);
    setErrorMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = event.currentTarget;
    const payload = new FormData(form);

    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) throw new Error("submit failed");
      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMessage("다시 시도해 주세요.");
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

        <label className="photo-field">
          <span>사진</span>
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handlePhotos}
          />
          <small>{photoCount} / 2</small>
        </label>

        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "제출 중" : "제출"}
        </button>

        {(status === "error" || errorMessage) && (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        )}
      </form>
    </main>
  );
}
