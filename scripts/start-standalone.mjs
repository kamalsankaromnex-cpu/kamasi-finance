import { spawn, execSync } from "node:child_process";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.startsWith("file:")) {
  const filePath = databaseUrl.slice("file:".length);
  if (filePath && !path.isAbsolute(filePath)) {
    process.env.DATABASE_URL = `file:${path.resolve(process.cwd(), "prisma", filePath)}`;
  }
}

try {
  console.log("Executing database migration deployment (npx prisma migrate deploy)...");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
} catch (err) {
  console.error("Database migration failed during startup:", err);
  process.exit(1);
}

process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.PORT = process.env.PORT || "10000";

const server = spawn(process.execPath, [path.join(process.cwd(), ".next", "standalone", "server.js")], {
  stdio: "inherit",
  env: process.env,
});

server.on("error", (error) => {
  console.error("Unable to start the standalone server:", error.message);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
