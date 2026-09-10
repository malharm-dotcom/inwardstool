import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, sessionCookie } from "./auth";
import { HttpError } from "./validation";

export async function requireUser() {
  const user = await getSession((await cookies()).get(sessionCookie)?.value);
  if (!user)
    throw new HttpError(
      401,
      "Your session has expired. Sign in again; pending scans stay on this device.",
    );
  return user;
}
export async function pageUser() {
  const user = await getSession((await cookies()).get(sessionCookie)?.value);
  if (!user) redirect("/login");
  return user;
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new HttpError(503, "Application URL is not configured.");
  if (request.headers.get("origin") !== new URL(appUrl).origin)
    throw new HttpError(
      403,
      "Request origin was not accepted. Reload the application using its configured address.",
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Send JSON for this request.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    throw new HttpError(400, "Invalid JSON request.");
  }
}
export async function route(fn: () => Promise<Response>) {
  try {
    const response = await fn();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    console.error("Request failed:", error);
    return Response.json(
      { error: "Could not save or load data. Check the connection and retry." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
