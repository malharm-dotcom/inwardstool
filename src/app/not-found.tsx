import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>Receipt not found</h1>
      <p>This link may be incorrect.</p>
      <Link className="button primary" href="/">
        Back to receiving
      </Link>
    </main>
  );
}
