import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { filename } = await params;
    const safeFilename = path.basename(filename);

    if (!safeFilename || safeFilename !== filename) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Household Ownership & Transaction Verification
    // Every receipt file MUST be linked to an existing transaction belonging to the user's household
    const linkedTx = await prisma.transaction.findFirst({
      where: {
        householdId: session.householdId,
        receiptUrl: { contains: safeFilename },
      },
    });

    if (!linkedTx) {
      // Check if file belongs to another household (403 Forbidden) vs doesn't exist (404 Not Found)
      const existingOtherHouseholdTx = await prisma.transaction.findFirst({
        where: {
          NOT: { householdId: session.householdId },
          receiptUrl: { contains: safeFilename },
        },
      });

      if (existingOtherHouseholdTx) {
        return NextResponse.json({ error: "Access denied: receipt belongs to another household" }, { status: 403 });
      }

      return NextResponse.json({ error: "Receipt not found or not associated with your household" }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), "storage", "receipts", safeFilename);
    const buffer = await readFile(filePath);

    const ext = path.extname(safeFilename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return NextResponse.json({ error: "Receipt file not found" }, { status: 404 });
    }
    console.error("Failed to read receipt:", error);
    return NextResponse.json({ error: "Failed to read receipt file" }, { status: 500 });
  }
}
