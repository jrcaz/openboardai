import { boolean, customType, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// --- Better Auth (email & password auth + sessions) ---
//
// These mirror the schema Better Auth's CLI generates for the default
// email/password configuration. Property names are camelCase to match Better
// Auth's field names (its Drizzle adapter accesses tables by these keys); SQL
// column names are snake_case for consistency with the rest of the DB.
// Defined here (rather than a separate file) so drizzle-kit can load this
// schema module without cross-file `.js` import resolution.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

const bytea = customType<{ data: Buffer; default: false; notNull: false }>({
  dataType() {
    return 'bytea'
  },
})

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled'),
  // Owner of the board. Nullable so the migration applies cleanly to any
  // pre-existing ownerless rows; new boards always set this to the creator.
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
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

export const aiHtmls = pgTable('ai_htmls', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .references(() => boards.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull().default('Untitled'),
  prompt: text('prompt'),
  source: text('source').notNull(),
  model: text('model'),
  byteSize: integer('byte_size').notNull(),
  bytes: bytea('bytes').notNull(),
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
