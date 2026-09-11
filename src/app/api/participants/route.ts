import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

function readText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getSupabase() {
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

function fromRow(row: Record<string, unknown>): Participant {
  return {
    id: String(row.id),
    name: String(row.name),
    studentId: String(row.student_id),
    major: String(row.major),
    subMajor: String(row.sub_major ?? ""),
    workInterest: String(row.work_interest ?? ""),
    personalInterest: String(row.personal_interest ?? ""),
    message: String(row.message ?? ""),
    createdAt: String(row.created_at),
  };
}

export async function GET() {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from("participants")
      .select(
        "id,name,student_id,major,sub_major,work_interest,personal_interest,message,created_at",
      )
      .eq("visible", true)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error && error.code !== "PGRST205") {
      return NextResponse.json({ error: "SUPABASE_READ_FAILED" }, { status: 503 });
    }

    if (data) {
      return NextResponse.json(data.map(fromRow), {
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

  try {
    body = (await request.json()) as Record<string, unknown>;
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

  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from("participants")
      .insert({
        name: participant.name,
        student_id: participant.studentId,
        major: participant.major,
        sub_major: participant.subMajor || null,
        work_interest: participant.workInterest || null,
        personal_interest: participant.personalInterest || null,
        message: participant.message || null,
      })
      .select(
        "id,name,student_id,major,sub_major,work_interest,personal_interest,message,created_at",
      )
      .single();

    if (error && error.code !== "PGRST205") {
      return NextResponse.json({ error: "SUPABASE_WRITE_FAILED" }, { status: 503 });
    }

    if (data) {
      return NextResponse.json(fromRow(data), { status: 201 });
    }
  }

  return NextResponse.json(addParticipant(participant), { status: 201 });
}
