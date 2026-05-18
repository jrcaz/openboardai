CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"model" text NOT NULL,
	"mode" text DEFAULT 'prompt' NOT NULL,
	"context_shape_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_shape_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;