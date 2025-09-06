import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const postgresUrl =
  process.env.POSTGRES_URL;

const client = new pg.Client({
  connectionString: postgresUrl,
});

(async () => {
  try {
    // Connect to the PostgreSQL database
    await client.connect();
    console.log("PostgreSQL client connected successfully.");

    const createTableQuery = `
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL,
                ownerId VARCHAR(255) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `;
    await client.query(createTableQuery);
    console.log("Tasks table checked/created.");

    console.log("Task service ready. Create tasks via UI or API.");

    await client.end();
  } catch (err) {
    console.error("Failed to connect to PostgreSQL or create table:", err);
  } finally {
    process.exit(0);
  }
})();
