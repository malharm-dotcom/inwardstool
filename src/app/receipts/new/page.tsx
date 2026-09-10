import Shell from "@/components/Shell";
import { pageUser } from "@/lib/api";
import NewReceipt from "./NewReceipt";
export default async function NewReceiptPage() {
  return (
    <Shell user={await pageUser()}>
      <NewReceipt />
    </Shell>
  );
}
