import { NextResponse } from "next/server";
import { getHealthMessage } from "@/lib/health";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: getHealthMessage(),
    uptime: Math.round(process.uptime()),
  });
}
