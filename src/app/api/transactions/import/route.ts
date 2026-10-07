import { NextResponse } from "next/server";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { previewCsvImport, commitCsvImport } from "@/lib/csv-import";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { mode, accountId, csvContent, selectedRows } = body;

    if (mode === "preview") {
      if (!accountId || !csvContent) {
        return NextResponse.json(
          { error: "Account ID and csvContent are required for preview" },
          { status: 400 }
        );
      }
      const previewResult = await previewCsvImport(
        session.householdId,
        accountId,
        csvContent
      );
      return NextResponse.json(previewResult, { status: 200 });
    }

    if (mode === "commit") {
      if (!Array.isArray(selectedRows) || selectedRows.length === 0) {
        return NextResponse.json(
          { error: "selectedRows array is required for commit mode" },
          { status: 400 }
        );
      }
      const commitResult = await commitCsvImport(
        session.householdId,
        session.id,
        selectedRows
      );
      return NextResponse.json(commitResult, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid import mode. Must be 'preview' or 'commit'" }, { status: 400 });
  } catch (error) {
    console.error("Failed to process CSV import:", error);
    return NextResponse.json({ error: "Failed to process CSV import" }, { status: 500 });
  }
}
