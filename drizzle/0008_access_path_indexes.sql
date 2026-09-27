CREATE INDEX "project_invitations_email_idx" ON "project_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_assignees_user_idx" ON "task_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_created_by_idx" ON "tasks" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tasks_position_idx" ON "tasks" USING btree ("position");--> statement-breakpoint
CREATE INDEX "views_owner_idx" ON "views" USING btree ("owner_id");