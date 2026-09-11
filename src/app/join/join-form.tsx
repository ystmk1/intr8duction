"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useState } from "react";

type Status = "idle" | "preparing" | "submitting" | "done" | "error";

/** Originals this large are fine — they get shrunk before they are sent. */
const maxSourceBytes = 30 * 1024 * 1024;
const maxPhotos = 2;
const maxPhotoEdge = 1600;

const serverMessages: Record<string, string> = {
  INVALID_PHOTOS: "사진 형식을 읽지 못했습니다. 다른 사진으로 시도해 주세요.",
  INVALID_FIELDS: "이름·학번·전공을 확인해 주세요.",
  INVALID_BODY: "제출 내용을 읽지 못했습니다. 다시 시도해 주세요.",
  PHOTO_UPLOAD_FAILED: "사진 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  PHOTO_STORAGE_NOT_READY: "사진 저장소가 준비되지 않았습니다. 진행자에게 알려 주세요.",
  SUPABASE_READ_FAILED: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  SUPABASE_WRITE_FAILED: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

/**
 * Phone photos run to several megabytes each, and two of them made the upload
 * slow enough to fail. Re-encoding through a canvas cuts them to a few hundred
 * kilobytes and normalises whatever the camera produced into plain JPEG.
 */
async function shrinkPhoto(file: File) {
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // A format the browser cannot decode: send it as-is and let the server judge.
    return file;
  }

  const scale = Math.min(1, maxPhotoEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });

  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

export function JoinForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [photos, setPhotos] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const busy = status === "preparing" || status === "submitting";

  function resizeTextarea(event: FormEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
  }

  function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);

    if (files.length > maxPhotos) {
      event.currentTarget.value = "";
      setPhotos([]);
      setErrorMessage(`사진은 ${maxPhotos}장까지 선택할 수 있습니다.`);
      return;
    }

    if (files.some((file) => file.size > maxSourceBytes)) {
      event.currentTarget.value = "";
      setPhotos([]);
      setErrorMessage("사진이 너무 큽니다. 다른 사진을 선택해 주세요.");
      return;
    }

    setPhotos(files);
    setErrorMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const payload = new FormData(event.currentTarget);
    // The raw camera files came along with the form; send shrunk ones instead.
    payload.delete("photos");

    try {
      if (photos.length) {
        setStatus("preparing");
        for (const photo of photos) {
          payload.append("photos", await shrinkPhoto(photo));
        }
      }

      setStatus("submitting");
      const response = await fetch("/api/participants", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = (body as { error?: string } | null)?.error ?? "";
        throw new Error(code);
      }

      setStatus("done");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setStatus("error");
      setErrorMessage(
        serverMessages[code] ??
          "제출하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
      );
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
          <textarea
            name="workInterest"
            maxLength={180}
            rows={1}
            placeholder="빈칸 가능"
            onInput={resizeTextarea}
          />
        </label>

        <label>
          <span>개인 관심사</span>
          <textarea
            name="personalInterest"
            maxLength={180}
            rows={1}
            placeholder="빈칸 가능"
            onInput={resizeTextarea}
          />
        </label>

        <label>
          <span>하고 싶은 말</span>
          <textarea
            name="message"
            maxLength={240}
            rows={1}
            placeholder="빈칸 가능"
            onInput={resizeTextarea}
          />
        </label>

        <label className="photo-field">
          <span>사진</span>
          <input
            type="file"
            name="photos"
            accept="image/*"
            multiple
            onChange={handlePhotos}
          />
          <small>
            {photos.length} / {maxPhotos}
          </small>
        </label>

        <button type="submit" disabled={busy}>
          {status === "preparing"
            ? "사진 준비 중"
            : status === "submitting"
              ? "제출 중"
              : "제출"}
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
