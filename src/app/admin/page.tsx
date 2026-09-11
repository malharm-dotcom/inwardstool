import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { pageUser } from "@/lib/api";
import Admin from "./Admin";
export default async function AdminPage() {
  const user = await pageUser();
  if (user.role !== "ADMIN") redirect("/");
  return (
    <Shell user={user}>
      <Admin />
    </Shell>
  );
}
