export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">Your bikes, invoices, and open service tickets at a glance.</p>
      <p className="mt-8 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Placeholder — reads from customers, bikes, invoices and service_tickets once a Supabase client is wired up.
      </p>
    </main>
  );
}
