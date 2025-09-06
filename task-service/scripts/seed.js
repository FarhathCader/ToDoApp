import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Get the PostgreSQL connection string from the environment variables
const postgresUrl =
  process.env.POSTGRES_URL;

// Create a new PostgreSQL client instance
const client = new pg.Client({
  connectionString: postgresUrl,
});

(async () => {
  try {
    // Connect to the PostgreSQL database
    await client.connect();
    console.log("PostgreSQL client connected successfully.");

    // SQL command to create the tasks table if it doesn't exist.
    // This is a crucial step for a relational database.
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

    // Just a placeholder; tasks are user-scoped so seeding happens after login in the UI.
    console.log("Task service ready. Create tasks via UI or API.");

    // Disconnect after the initial setup. In a real application, you would keep the connection open.
    await client.end();
  } catch (err) {
    console.error("Failed to connect to PostgreSQL or create table:", err);
  } finally {
    // It's good practice to close the process after a script finishes
    process.exit(0);
  }
})();
