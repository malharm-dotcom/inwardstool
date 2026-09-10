"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>We couldn’t load this workspace.</h1>
      <p>
        Check the application and database connection, then try again. Saved
        receipts and pending scans remain in place.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
