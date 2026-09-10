import { cookies } from "next/headers";
import { body, route } from "@/lib/api";
import { sessionCookie, signIn, signOut } from "@/lib/auth";

export async function POST(request: Request) {
  return route(async () => {
    const input = await body(request);
    const token = await signIn(
      input.username as string,
      input.password as string,
    );
    (await cookies()).set(sessionCookie, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(process.env.APP_URL!).protocol === "https:",
      path: "/",
      maxAge: 43200,
    });
    return Response.json({ ok: true });
  });
}
export async function DELETE(request: Request) {
  return route(async () => {
    await body(request);
    const jar = await cookies();
    await signOut(jar.get(sessionCookie)?.value);
    jar.delete(sessionCookie);
    return Response.json({ ok: true });
  });
}
