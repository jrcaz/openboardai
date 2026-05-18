CREATE TABLE "ai_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer,
	"has_audio" boolean DEFAULT false NOT NULL,
	"media_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"result_shape_id" text,
	"source_image_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_videos" ADD CONSTRAINT "ai_videos_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;