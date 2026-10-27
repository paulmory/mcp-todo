import { createDatabaseBackup } from "../src/shared/db/backup.ts";
import { databasePath, db } from "../src/shared/db/index.ts";

try {
  const backupPath = createDatabaseBackup(db, databasePath);
  console.log(`Database backup created: ${backupPath}`);
} finally {
  db.close();
}
