import { body, requireUser, route } from "@/lib/api";
import { createStaff, listStaff, setStaffActive } from "@/lib/admin";
export async function GET() {
  return route(async () =>
    Response.json(await listStaff((await requireUser()).id)),
  );
}
export async function POST(request: Request) {
  return route(async () => {
    const actor = await requireUser();
    const input = await body(request);
    const user = await createStaff(actor.id, {
      username: input.username,
      displayName: input.displayName,
      password: input.password,
    });
    return Response.json(user, { status: 201 });
  });
}
export async function PATCH(request: Request) {
  return route(async () => {
    const actor = await requireUser();
    const input = await body(request);
    await setStaffActive(actor.id, input.userId as string, input.active);
    return Response.json({ ok: true });
  });
}
