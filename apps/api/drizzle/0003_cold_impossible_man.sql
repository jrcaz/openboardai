CREATE TABLE "ai_htmls" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"prompt" text,
	"source" text NOT NULL,
	"model" text,
	"byte_size" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"result_shape_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_htmls" ADD CONSTRAINT "ai_htmls_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;