ALTER TABLE "project_members" ADD COLUMN "position" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "position" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Seed each member's sidebar order from the order the sidebar already showed:
-- oldest project first. Positions are per member, so two people sharing a
-- project can arrange their own sidebars independently.
UPDATE "project_members" SET "position" = "seeded"."rank"
FROM (
	SELECT
		"pm"."project_id",
		"pm"."user_id",
		row_number() OVER (PARTITION BY "pm"."user_id" ORDER BY "p"."created_at", "p"."id") AS "rank"
	FROM "project_members" "pm"
	JOIN "projects" "p" ON "p"."id" = "pm"."project_id"
) AS "seeded"
WHERE "seeded"."project_id" = "project_members"."project_id"
	AND "seeded"."user_id" = "project_members"."user_id";--> statement-breakpoint
-- Seed the manual task order from the order the board already showed: newest
-- first. Ranks start at 1 so a task created later can take a smaller position
-- and land on top without renumbering anything.
UPDATE "tasks" SET "position" = "seeded"."rank"
FROM (
	SELECT "id", row_number() OVER (ORDER BY "created_at" DESC, "id") AS "rank"
	FROM "tasks"
) AS "seeded"
WHERE "seeded"."id" = "tasks"."id";
