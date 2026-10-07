import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const formData = await req.formData();
    const file = formData.get("logo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image file provided in request body" }, { status: 400 });
    }

    // Validate size (max 2MB for account logos)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo file size exceeds maximum allowed limit of 2MB" }, { status: 400 });
    }

    // Validate declared MIME type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, and WEBP image files are supported for logos" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic Bytes File Signature Validation
    function detectMimeFromMagicBytes(buf: Buffer): string | null {
      if (buf.length < 12) return null;
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
      if (
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
      ) return "image/webp";
      return null;
    }

    const detectedMime = detectMimeFromMagicBytes(buffer);
    if (!detectedMime || !allowedTypes.includes(detectedMime)) {
      return NextResponse.json({ error: "File signature verification failed: invalid magic bytes or unsupported file format" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "storage", "logos");
    await mkdir(uploadDir, { recursive: true });

    const MIME_EXTENSION_MAP: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    };
    const safeExt = MIME_EXTENSION_MAP[detectedMime] || ".bin";
    const filename = `logo_${crypto.randomUUID()}${safeExt}`;
    const filePath = path.join(uploadDir, filename);

    await writeFile(filePath, buffer);

    const publicUrl = `/api/uploads/logos/${filename}`;
    return NextResponse.json({ url: publicUrl, filename, size: file.size, type: detectedMime });
  } catch (error) {
    console.error("Account logo upload error:", error);
    return NextResponse.json({ error: "Failed to upload account logo" }, { status: 500 });
  }
}
