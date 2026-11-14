import { loadEnvFile } from "./env";
import { startServer } from "./server";

loadEnvFile();

startServer().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
