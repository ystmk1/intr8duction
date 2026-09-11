import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteParticipant } from "@/lib/participants";

const photoBucket = "participant-photos";

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

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/participants/[id]">,
) {
  const { id } = await context.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const supabase = getSupabase();

  if (supabase) {
    let photoPaths: string[] = [];
    let participantExists = false;
    const currentResult = await supabase
      .from("participants")
      .select("id,photo_paths")
      .eq("id", id)
      .maybeSingle();

    if (currentResult.error?.code === "42703") {
      const legacyResult = await supabase
        .from("participants")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (legacyResult.error) {
        return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
      }

      participantExists = Boolean(legacyResult.data);
    } else if (currentResult.error?.code === "PGRST205") {
      const deleted = deleteParticipant(id);
      return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
    } else if (currentResult.error) {
      return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
    } else if (currentResult.data) {
      participantExists = true;
      photoPaths = Array.isArray(currentResult.data.photo_paths)
        ? currentResult.data.photo_paths.map(String)
        : [];
    }

    if (!participantExists) {
      return NextResponse.json({ deleted: false }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("participants")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
    }

    if (photoPaths.length) {
      await supabase.storage.from(photoBucket).remove(photoPaths);
    }

    return NextResponse.json({ deleted: true });
  }

  const deleted = deleteParticipant(id);
  return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
}
