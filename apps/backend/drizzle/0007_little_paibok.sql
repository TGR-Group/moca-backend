CREATE TABLE IF NOT EXISTS "lost_property" (
	"id" serial PRIMARY KEY NOT NULL,
	"lostproperty_name" varchar(50) NOT NULL,
	"status" boolean DEFAULT false NOT NULL,
	"found_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"last_updated" timestamp DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "place" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "menu" json;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "time_table" json;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lost_property" ADD CONSTRAINT "lost_property_found_by_staff_id_fk" FOREIGN KEY ("found_by") REFERENCES "staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_status" ADD CONSTRAINT "stock_status_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
