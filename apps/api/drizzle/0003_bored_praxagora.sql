CREATE TABLE "ai_transcriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"model" text NOT NULL,
	"media_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"duration_ms" integer,
	"transcript" text DEFAULT '' NOT NULL,
	"instruction" text,
	"result_shape_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_transcriptions" ADD CONSTRAINT "ai_transcriptions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;