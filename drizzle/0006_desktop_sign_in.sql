CREATE TABLE "desktop_sign_in" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "desktop_sign_in_expires_at_idx" ON "desktop_sign_in" USING btree ("expires_at");