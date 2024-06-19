import type { Config } from "drizzle-kit";

export default {
    schema: "./db/schema.ts",
    out: "./drizzle",
    driver: "pg",
    dbCredentials: {
        connectionString: "postgres://postgres:postgres@db:5432",
    },
} satisfies Config;
