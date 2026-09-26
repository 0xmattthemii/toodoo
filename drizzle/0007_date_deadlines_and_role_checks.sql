-- Deadlines become calendar days. The picker used to store the local midnight
-- of the chosen day as an instant: September 24 picked in Zurich (UTC+2) is
-- 2026-09-23 22:00Z, and one picked in Los Angeles (UTC-7) is 07:00Z the same
-- day; the MCP server stored UTC midnight. Half a day later lands inside the
-- intended day, in UTC, for every offset from UTC-12 to UTC+12.
ALTER TABLE "tasks" ALTER COLUMN "deadline" SET DATA TYPE date USING (("deadline" AT TIME ZONE 'UTC') + interval '12 hours')::date;--> statement-breakpoint
-- Roles and statuses were only checked by TypeScript, so any string could be
-- written. Anything unrecognised is demoted to the least privilege first, or
-- adding the constraints would fail.
UPDATE "project_members" SET "role" = 'member' WHERE "role" NOT IN ('admin', 'member');--> statement-breakpoint
UPDATE "project_invitations" SET "role" = 'member' WHERE "role" NOT IN ('admin', 'member');--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_role_check" CHECK ("project_invitations"."role" in ('admin', 'member'));--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_status_check" CHECK ("project_invitations"."status" in ('pending', 'accepted'));--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_check" CHECK ("project_members"."role" in ('admin', 'member'));
