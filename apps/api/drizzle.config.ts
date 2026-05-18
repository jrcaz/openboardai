import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://openboard_ai:openboard_ai@localhost:5436/openboard_ai',
  },
  strict: true,
  verbose: true,
})
