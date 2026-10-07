import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePendingOccurrences } from "@/lib/recurrence";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET || "internal-cron-secret";

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron trigger: Invalid or missing Bearer token" }, { status: 401 });
    }

    const result = await generatePendingOccurrences(prisma);

    return NextResponse.json({
      success: true,
      message: `Generated ${result.count} recurring occurrences`,
      occurrences: result.occurrences,
    });
  } catch (error) {
    console.error("Cron recurrence trigger error:", error);
    return NextResponse.json({ error: "Failed to execute recurrence scheduler" }, { status: 500 });
  }
}
