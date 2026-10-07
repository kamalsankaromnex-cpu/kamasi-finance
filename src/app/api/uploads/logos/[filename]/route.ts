import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Sanitize filename to prevent path traversal attacks
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "storage", "logos", safeFilename);

    try {
      const buffer = await readFile(filePath);

      let contentType = "application/octet-stream";
      if (safeFilename.endsWith(".jpg") || safeFilename.endsWith(".jpeg")) contentType = "image/jpeg";
      if (safeFilename.endsWith(".png")) contentType = "image/png";
      if (safeFilename.endsWith(".webp")) contentType = "image/webp";

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return NextResponse.json({ error: "Logo file not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Error serving logo file:", error);
    return NextResponse.json({ error: "Failed to serve logo file" }, { status: 500 });
  }
}
