ALTER TABLE "tasks" ADD COLUMN "done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "done" = ("status" = 'done');--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status";
