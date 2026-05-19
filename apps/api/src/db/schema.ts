import { boolean, customType, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; default: false; notNull: false }>({
  dataType() {
    return 'bytea'
  },
})

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled'),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const aiMessages = pgTable('ai_messages', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .references(() => boards.id, { onDelete: 'cascade' })
    .notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  model: text('model').notNull(),
  mode: text('mode').notNull().default('prompt'),
  contextShapeIds: jsonb('context_shape_ids').$type<string[]>().default([]).notNull(),
  resultShapeId: text('result_shape_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const aiImages = pgTable('ai_images', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .references(() => boards.id, { onDelete: 'cascade' })
    .notNull(),
  prompt: text('prompt').notNull(),
  model: text('model').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  mediaType: text('media_type').notNull(),
  bytes: bytea('bytes').notNull(),
  resultShapeId: text('result_shape_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const aiTranscriptions = pgTable('ai_transcriptions', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .references(() => boards.id, { onDelete: 'cascade' })
    .notNull(),
  model: text('model').notNull(),
  mediaType: text('media_type').notNull(),
  bytes: bytea('bytes').notNull(),
  durationMs: integer('duration_ms'),
  transcript: text('transcript').notNull().default(''),
  instruction: text('instruction'),
  resultShapeId: text('result_shape_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const aiVideos = pgTable('ai_videos', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .references(() => boards.id, { onDelete: 'cascade' })
    .notNull(),
  prompt: text('prompt').notNull(),
  model: text('model').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  durationMs: integer('duration_ms'),
  hasAudio: boolean('has_audio').notNull().default(false),
  mediaType: text('media_type').notNull(),
  bytes: bytea('bytes').notNull(),
  resultShapeId: text('result_shape_id'),
  sourceImageId: text('source_image_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
