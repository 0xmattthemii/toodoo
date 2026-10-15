CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_role_check" CHECK ("workspace_invitations"."role" in ('admin', 'member')),
	CONSTRAINT "workspace_invitations_status_check" CHECK ("workspace_invitations"."status" in ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('owner', 'admin', 'member', 'guest'))
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"signups_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_settings_single_row" CHECK ("workspace_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_pending_email_idx" ON "workspace_invitations" USING btree ("email") WHERE "workspace_invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_single_owner_idx" ON "workspace_members" USING btree ("role") WHERE "workspace_members"."role" = 'owner';--> statement-breakpoint
-- Existing deployments: the settings row keeps sign-ups open, as they were,
-- and everyone who already has an account joins the workspace as a member —
-- except the oldest account, which becomes its owner.
INSERT INTO "workspace_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_members" ("user_id", "role", "created_at")
SELECT "id",
	CASE WHEN row_number() OVER (ORDER BY "created_at", "id") = 1 THEN 'owner' ELSE 'member' END,
	"created_at"
FROM "user"
ON CONFLICT DO NOTHING;
