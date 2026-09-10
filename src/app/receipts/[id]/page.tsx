import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import { pageUser } from "@/lib/api";
import { getReceipt } from "@/lib/receipts";
import { HttpError } from "@/lib/validation";
import Receiving from "./Receiving";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await pageUser();
  const { id } = await params;
  try {
    return (
      <Shell user={user}>
        <Receiving key={id} initial={await getReceipt(id)} user={user} />
      </Shell>
    );
  } catch (error) {
    if (error instanceof HttpError && [400, 404].includes(error.status))
      notFound();
    throw error;
  }
}
