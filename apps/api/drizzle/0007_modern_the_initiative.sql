CREATE TABLE "board_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_board_id" text,
	"title" text NOT NULL,
	"description" text,
	"snapshot" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_templates" ADD CONSTRAINT "board_templates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_templates" ADD CONSTRAINT "board_templates_source_board_id_boards_id_fk" FOREIGN KEY ("source_board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;