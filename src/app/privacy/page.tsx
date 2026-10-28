import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What MTG Dash stores, why, and how to get it removed.",
};

const UPDATED = "October 28, 2026";
const CONTACT = "archer@fabledesigner.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-[calc(3rem+env(safe-area-inset-top))] pb-16">
      <p className="label-caps mb-2 text-gold">MTG Dash</p>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">
        Privacy policy
      </h1>
      <p className="mb-10 text-sm text-ink-dim">Last updated {UPDATED}.</p>

      <div className="space-y-8 text-[15px] leading-relaxed text-ink">
        <section>
          <h2 className="mb-2 text-xl font-semibold">What MTG Dash is</h2>
          <p>
            MTG Dash runs Magic: The Gathering nights among friends: pairings,
            life totals, standings and a portrait for each player. It is
            offered as a website at mtg.capxun.com and as an iOS and Android
            app that shows the same website. There are no ads and nothing is
            sold.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">What is stored</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Players:</strong> the display name you enter, your
              results and life totals in each event, and your league
              identity. Players never create an account or give an email
              address.
            </li>
            <li>
              <strong>Portraits:</strong> if you choose to make a wizard
              portrait, the selfie you take or pick is sent to an image
              generation service and used to produce the portrait. The
              portrait is stored and shown to your league; the original selfie
              is kept so later portrait tiers can be generated from it.
            </li>
            <li>
              <strong>Organizers:</strong> the email address you sign in with.
              It is used only to send your sign-in code and to tie leagues to
              your account.
            </li>
            <li>
              <strong>Cookies:</strong> small identifiers that keep your phone
              recognized as a player or organizer in a league. They are not
              used for advertising.
            </li>
            <li>
              <strong>Usage:</strong> anonymous page views through Google
              Analytics, to see which parts of the app are used.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Who processes it</h2>
          <p>
            Data is hosted in the United States with Vercel (web hosting and
            file storage), Neon (database), Upstash (real-time updates) and
            Resend (sign-in emails). Selfies are processed by fal.ai or a
            private image server to generate portraits. None of these
            providers may use the data for their own purposes.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Who can see it</h2>
          <p>
            Leagues are unlisted. Your name, results and portrait are visible
            to anyone who has your league&apos;s link, which is the people
            your organizer shared it with. Organizers can see the names and
            results of players in their leagues. Nothing is shared with
            advertisers or data brokers.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Removal</h2>
          <p>
            Email {CONTACT} from the address you organize with, or with the
            league and player name, and the player, portrait, selfie or
            organizer account will be deleted within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Children</h2>
          <p>
            MTG Dash is for people 13 and older and does not knowingly store
            information about younger children.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Contact</h2>
          <p>
            Questions go to {CONTACT}. Changes to this policy are posted on
            this page with a new date.
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm">
        <Link href="/" className="text-gold underline-offset-4 hover:underline">
          Back to MTG Dash
        </Link>
      </p>
    </main>
  );
}
