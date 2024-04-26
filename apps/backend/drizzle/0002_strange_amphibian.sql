CREATE TABLE IF NOT EXISTS "queues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" varchar NOT NULL,
	"status" varchar NOT NULL
);
