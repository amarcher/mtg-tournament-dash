/**
 * Grant a signed-up account ownership of a league:
 *
 *   npx tsx --env-file=.env.local scripts/grant-league-owner.ts <league-slug> <email>
 *
 * The account must exist already (sign in once first — in dev the magic link
 * is printed to the dev-server console when RESEND_API_KEY is unset). Sets
 * leagues.owner_user_id and upserts an owner row in league_members. Used for
 * the ownership backfill of pre-auth leagues (demo, lexington-dads-magic-draft)
 * and safe to re-run.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leagueMembers, leagues, user } from "@/db/schema";

async function main() {
  const [slug, email] = process.argv.slice(2);
  if (!slug || !email) {
    console.error(
      "usage: npx tsx --env-file=.env.local scripts/grant-league-owner.ts <league-slug> <email>"
    );
    process.exit(1);
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.slug, slug));
  if (!league) {
    console.error(`league not found: ${slug}`);
    process.exit(1);
  }

  const [account] = await db.select().from(user).where(eq(user.email, email));
  if (!account) {
    console.error(
      `no account for ${email} — sign in once first (dev: magic link is in the dev-server console), then re-run`
    );
    process.exit(1);
  }

  // First grantee becomes the primary owner (owner_user_id — the un-removable
  // anchor). Later grantees become co-owners: a league_members row with
  // role='owner', which the authz layer treats identically.
  let coOwner = false;
  if (league.ownerUserId && league.ownerUserId !== account.id) {
    const [primary] = await db
      .select()
      .from(user)
      .where(eq(user.id, league.ownerUserId));
    coOwner = true;
    console.log(
      `primary owner stays ${primary?.email ?? league.ownerUserId}; adding ${email} as co-owner`
    );
  } else {
    await db
      .update(leagues)
      .set({ ownerUserId: account.id })
      .where(eq(leagues.id, league.id));
  }
  const [existing] = await db
    .select()
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, league.id),
        eq(leagueMembers.userId, account.id)
      )
    );
  if (existing) {
    await db
      .update(leagueMembers)
      .set({ role: "owner" })
      .where(
        and(
          eq(leagueMembers.leagueId, league.id),
          eq(leagueMembers.userId, account.id)
        )
      );
  } else {
    await db
      .insert(leagueMembers)
      .values({ leagueId: league.id, userId: account.id, role: "owner" });
  }

  console.log(
    `${email} now ${coOwner ? "co-owns" : "owns"} "${league.name}" (/${league.slug})`
  );
}

main();
