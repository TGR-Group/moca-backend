ALTER TABLE "programs" ALTER COLUMN "class_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "category" varchar DEFAULT 'その他' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "grade" varchar DEFAULT 'その他' NOT NULL;