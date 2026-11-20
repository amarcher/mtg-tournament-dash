/**
 * The second step of taking a wizard: a tap on the grid lands here first,
 * because the take is permanent for the tapper and a mis-tap would lock the
 * wizard's real player out mid-event.
 */
export function TakeWizardConfirm({
  action,
  fields,
  wizardName,
  accountEmail,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Everything the claim action needs, minus the confirmation itself. */
  fields: Record<string, string>;
  wizardName: string;
  accountEmail: string;
  cancelHref: string;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5">
      <h2 className="text-lg font-semibold text-amber-100">
        Make {wizardName} yours?
      </h2>
      <p className="mt-1 text-sm text-zinc-300">
        {wizardName} will belong to <strong>{accountEmail}</strong>. Only that
        account will be able to play as this wizard, and it is the one wizard
        the account gets in this league.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="confirmTake" value="1" />
        <button type="submit" className="min-h-11 rounded-md btn-gold px-5 text-sm">
          Yes, I&apos;m {wizardName}
        </button>
        <a
          href={cancelHref}
          className="min-h-11 rounded-md border border-zinc-700 px-4 py-3 text-sm text-zinc-300 transition hover:bg-zinc-800"
        >
          Not me
        </a>
      </form>
    </section>
  );
}
