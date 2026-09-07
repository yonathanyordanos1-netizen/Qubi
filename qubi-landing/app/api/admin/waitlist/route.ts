import { NextResponse } from "next/server";
import { getSupabase, WaitlistEntry } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const passcode = url.searchParams.get("passcode") ?? "";

  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_waitlist", { p_passcode: passcode });

  if (error) {
    console.error("admin waitlist rpc error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ entries: (data as WaitlistEntry[]) ?? [] });
}