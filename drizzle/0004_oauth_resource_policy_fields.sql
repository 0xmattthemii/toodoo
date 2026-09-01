ALTER TABLE "oauth_resource" ADD COLUMN "dpop_bound_access_tokens_required" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "oauth_resource" ADD COLUMN "policy_version" integer DEFAULT 1;