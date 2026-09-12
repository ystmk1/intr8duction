import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addParticipant, getParticipants } from "@/lib/participants";
import type { Participant } from "@/lib/participants";

export const dynamic = "force-dynamic";

const limits = {
  name: 24,
  major: 60,
  subMajor: 60,
  workInterest: 180,
  personalInterest: 180,
  message: 240,
} as const;

const photoBucket = "participant-photos";
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 5 * 1024 * 1024;

function readText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getSupabase() {
  if (process.env.CRE8_FORCE_LOCAL_STORE === "1") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}

function fromRow(
  row: Record<string, unknown>,
  supabase?: SupabaseClient,
): Participant {
  const photoPaths = Array.isArray(row.photo_paths)
    ? row.photo_paths.map(String)
    : [];

  return {
    id: String(row.id),
    name: String(row.name),
    studentId: String(row.student_id),
    major: String(row.major),
    subMajor: String(row.sub_major ?? ""),
    workInterest: String(row.work_interest ?? ""),
    personalInterest: String(row.personal_interest ?? ""),
    message: String(row.message ?? ""),
    photos: supabase
      ? photoPaths.map(
          (path) => supabase.storage.from(photoBucket).getPublicUrl(path).data.publicUrl,
        )
      : [],
    createdAt: String(row.created_at),
  };
}

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function fileToDataUrl(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  return `data:${file.type};base64,${bytes}`;
}

export async function GET() {
  const supabase = getSupabase();

  if (supabase) {
    const currentResult = await supabase
      .from("participants")
      .select(
        "id,name,student_id,major,sub_major,work_interest,personal_interest,message,photo_paths,created_at",
      )
      .eq("visible", true)
      .order("created_at", { ascending: true })
      .limit(100);
    let rows = currentResult.data as Record<string, unknown>[] | null;
    let error = currentResult.error;

    if (error?.code === "42703") {
      const legacyResult = await supabase
        .from("participants")
        .select(
          "id,name,student_id,major,sub_major,work_interest,personal_interest,message,created_at",
        )
        .eq("visible", true)
        .order("created_at", { ascending: true })
        .limit(100);
      rows = legacyResult.data as Record<string, unknown>[] | null;
      error = legacyResult.error;
    }

    if (error && error.code !== "PGRST205") {
      return NextResponse.json({ error: "SUPABASE_READ_FAILED" }, { status: 503 });
    }

    if (rows) {
      return NextResponse.json(rows.map((row) => fromRow(row, supabase)), {
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  return NextResponse.json(getParticipants(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  let photos: File[] = [];

  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = Object.fromEntries(
        [...formData.entries()].filter((entry): entry is [string, string] =>
          typeof entry[1] === "string",
        ),
      );
      photos = formData
        .getAll("photos")
        .filter((value): value is File => value instanceof File && value.size > 0);
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const participant = {
    name: readText(body.name, limits.name),
    studentId: readText(body.studentId, 2),
    major: readText(body.major, limits.major),
    subMajor: readText(body.subMajor, limits.subMajor),
    workInterest: readText(body.workInterest, limits.workInterest),
    personalInterest: readText(body.personalInterest, limits.personalInterest),
    message: readText(body.message, limits.message),
  };

  if (
    !participant.name ||
    !/^\d{2}$/.test(participant.studentId) ||
    !participant.major
  ) {
    return NextResponse.json({ error: "INVALID_FIELDS" }, { status: 400 });
  }

  if (
    photos.length > 3 ||
    photos.some(
      (photo) => !allowedPhotoTypes.has(photo.type) || photo.size > maxPhotoBytes,
    )
  ) {
    return NextResponse.json({ error: "INVALID_PHOTOS" }, { status: 400 });
  }

  const supabase = getSupabase();
  let supabaseReady = false;

  if (supabase) {
    const { error: readinessError } = await supabase
      .from("participants")
      .select("id")
      .limit(1);

    if (readinessError && readinessError.code !== "PGRST205") {
      return NextResponse.json({ error: "SUPABASE_READ_FAILED" }, { status: 503 });
    }

    supabaseReady = !readinessError;
  }

  if (supabase && supabaseReady) {
    const participantId = crypto.randomUUID();
    const photoPaths: string[] = [];

    if (photos.length) {
      const { error: photoSchemaError } = await supabase
        .from("participants")
        .select("photo_paths")
        .limit(1);

      if (photoSchemaError) {
        return NextResponse.json(
          { error: "PHOTO_STORAGE_NOT_READY" },
          { status: 503 },
        );
      }
    }

    // Uploaded together rather than one after another: two photos on a phone
    // connection took long enough in sequence to time the submission out.
    const uploads = await Promise.all(
      photos.map(async (photo, index) => {
        const path = `${participantId}/${index + 1}.${extensionFor(photo.type)}`;
        const { error: uploadError } = await supabase.storage
          .from(photoBucket)
          .upload(path, await photo.arrayBuffer(), {
            contentType: photo.type,
            upsert: false,
          });

        return { path, failed: Boolean(uploadError) };
      }),
    );

    photoPaths.push(...uploads.filter((u) => !u.failed).map((u) => u.path));

    if (uploads.some((upload) => upload.failed)) {
      if (photoPaths.length) {
        await supabase.storage.from(photoBucket).remove(photoPaths);
      }
      return NextResponse.json({ error: "PHOTO_UPLOAD_FAILED" }, { status: 503 });
    }

    const insertPayload = {
      id: participantId,
      name: participant.name,
      student_id: participant.studentId,
      major: participant.major,
      sub_major: participant.subMajor || null,
      work_interest: participant.workInterest || null,
      personal_interest: participant.personalInterest || null,
      message: participant.message || null,
      ...(photos.length ? { photo_paths: photoPaths } : {}),
    };
    const result = photos.length
      ? await supabase
          .from("participants")
          .insert(insertPayload)
          .select(
            "id,name,student_id,major,sub_major,work_interest,personal_interest,message,photo_paths,created_at",
          )
          .single()
      : await supabase
          .from("participants")
          .insert(insertPayload)
          .select(
            "id,name,student_id,major,sub_major,work_interest,personal_interest,message,created_at",
          )
          .single();
    const data = result.data as Record<string, unknown> | null;
    const error = result.error;

    if (error) {
      if (photoPaths.length) {
        await supabase.storage.from(photoBucket).remove(photoPaths);
      }

      if (error.code === "PGRST205") {
        const localPhotos = await Promise.all(photos.map(fileToDataUrl));
        return NextResponse.json(
          addParticipant({ ...participant, photos: localPhotos }),
          { status: 201 },
        );
      }

      return NextResponse.json({ error: "SUPABASE_WRITE_FAILED" }, { status: 503 });
    }

    if (data) {
      return NextResponse.json(fromRow(data, supabase), { status: 201 });
    }
  }

  const localPhotos = await Promise.all(photos.map(fileToDataUrl));
  return NextResponse.json(
    addParticipant({ ...participant, photos: localPhotos }),
    { status: 201 },
  );
}
