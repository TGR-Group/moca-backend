CREATE TABLE IF NOT EXISTS "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" varchar NOT NULL,
	"class_name" varchar NOT NULL,
	"public" boolean NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"called_at" timestamp,
	"in_at" timestamp,
	"exited_at" timestamp,
	"status" varchar NOT NULL,
	"program_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"password_hash" varchar NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "users_token_unique" UNIQUE("token")
);
