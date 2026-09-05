import "dotenv/config";
import { createAdminPool } from "../src/client.js";
import { migrateDown, migrateUp } from "../src/migrator.js";

async function main() {
  const direction = process.argv[2];
  const pool = createAdminPool();
  try {
    if (direction === "up") {
      const ran = await migrateUp(pool);
      console.log(ran.length > 0 ? `Applied: ${ran.join(", ")}` : "Already up to date.");
    } else if (direction === "down") {
      const stepsArg = process.argv[3];
      const steps = stepsArg ? Number(stepsArg) : Infinity;
      const reverted = await migrateDown(pool, steps);
      console.log(reverted.length > 0 ? `Reverted: ${reverted.join(", ")}` : "Nothing to revert.");
    } else {
      console.error('Usage: tsx scripts/migrate.ts <up|down> [downSteps]');
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
