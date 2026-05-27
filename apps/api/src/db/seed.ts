import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { auth } from '../auth.js'
import { db, schema } from './client.js'

// Demo account for local testing. Re-running is safe (idempotent): the user is
// created via Better Auth (so the password is hashed correctly) only if missing,
// and seed boards are added only if the account has none.
const DEMO = {
  email: 'demo@openboard.ai',
  password: 'demopassword123',
  name: 'Demo User',
}

const SEED_BOARD_TITLES = ['Welcome to OpenBoard', 'Marketing Ideas', 'Product Roadmap']

async function main() {
  // Never create the well-known demo credentials against a production database.
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] refusing to run with NODE_ENV=production')
    process.exit(1)
  }

  // 1) Ensure the demo user exists.
  let [user] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, DEMO.email))
    .limit(1)

  if (!user) {
    await auth.api.signUpEmail({
      body: { email: DEMO.email, password: DEMO.password, name: DEMO.name },
    })
    ;[user] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, DEMO.email))
      .limit(1)
    console.log(`[seed] created demo user ${DEMO.email}`)
  } else {
    console.log(`[seed] demo user ${DEMO.email} already exists`)
  }

  if (!user) throw new Error('failed to resolve demo user after creation')

  // 2) Seed a few boards if the account is empty.
  const existingBoards = await db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(eq(schema.boards.userId, user.id))

  if (existingBoards.length === 0) {
    for (const title of SEED_BOARD_TITLES) {
      await db.insert(schema.boards).values({ id: nanoid(12), title, userId: user.id })
    }
    console.log(`[seed] created ${SEED_BOARD_TITLES.length} boards`)
  } else {
    console.log(`[seed] account already has ${existingBoards.length} board(s) — skipping`)
  }

  console.log('\n[seed] done. Log in with:')
  console.log(`  email:    ${DEMO.email}`)
  console.log(`  password: ${DEMO.password}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed', err)
    process.exit(1)
  })
