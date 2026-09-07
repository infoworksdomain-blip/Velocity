ALTER TABLE "velocity_events" RENAME COLUMN "velocity_session_id" TO "blitz_session_id";--> statement-breakpoint
ALTER TABLE "velocity_events" RENAME TO "blitz_events";--> statement-breakpoint
ALTER TABLE "velocity_sessions" RENAME TO "blitz_sessions";
