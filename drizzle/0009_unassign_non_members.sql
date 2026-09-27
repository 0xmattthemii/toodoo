-- A project's tasks are now visible to its members only, and only they can be
-- assigned one. Assignments made before that rule, to someone outside the
-- task's project, grant nothing any more and would be dropped by the next
-- edit of the task anyway; remove them now, as removing a member does.
DELETE FROM "task_assignees"
USING "tasks"
WHERE "tasks"."id" = "task_assignees"."task_id"
	AND "tasks"."project_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "project_members"
		WHERE "project_members"."project_id" = "tasks"."project_id"
			AND "project_members"."user_id" = "task_assignees"."user_id"
	);
