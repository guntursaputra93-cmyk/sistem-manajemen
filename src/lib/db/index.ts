import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL belum diset di environment variables.");
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
