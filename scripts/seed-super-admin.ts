/**
 * One-time utility: create (or promote) a super_admin account.
 *
 * The app has no way to grant the first role through its own UI — assigning
 * a role requires already holding "users.manage" permission — so this script
 * bypasses the API on purpose, the same way `django-admin createsuperuser` or
 * a Rails db:seed would. Use it to bootstrap local dev (sign in through the
 * real /api/signin form afterward, no separate dev-only auth path) or the
 * very first production admin.
 *
 * Usage: npx tsx --env-file=.env scripts/seed-super-admin.ts <email> <password> [firstName] [lastName]
 */
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { eq } from "drizzle-orm";
import { users } from "../shared/models/auth";
import { userRoles } from "../shared/schema";

neonConfig.webSocketConstructor = ws;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  const [email, password, firstName = "Super", lastName = "Admin"] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Usage: npx tsx --env-file=.env scripts/seed-super-admin.ts <email> <password> [firstName] [lastName]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);

  let [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: normalizedEmail, firstName, lastName, passwordHash })
      .returning();
    console.log(`✓ Created user ${user.email}`);
  } else {
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    console.log(`✓ Updated password for existing user ${user.email}`);
  }

  const [existingRole] = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));

  if (!existingRole) {
    await db.insert(userRoles).values({ userId: user.id, role: "super_admin" });
    console.log("✓ Assigned super_admin role");
  } else if (existingRole.role !== "super_admin") {
    await db.update(userRoles).set({ role: "super_admin" }).where(eq(userRoles.id, existingRole.id));
    console.log("✓ Upgraded existing role to super_admin");
  } else {
    console.log("✓ Already super_admin");
  }

  console.log(`\nDone — sign in at /api/signin with ${normalizedEmail}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
