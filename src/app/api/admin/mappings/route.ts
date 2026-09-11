import { body, requireUser, route } from "@/lib/api";
import { assertAdmin } from "@/lib/admin";
import { importMappings, listMappings, parseMappingCsv } from "@/lib/mappings";
import { HttpError } from "@/lib/validation";
export async function GET(request: Request) {
  return route(async () =>
    Response.json(
      await listMappings(
        (await requireUser()).id,
        new URL(request.url).searchParams.get("q") ?? "",
      ),
    ),
  );
}
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    await assertAdmin(user.id);
    const input = await body(request, 10_000_000);
    if (typeof input.csv !== "string")
      throw new HttpError(400, "Upload a CSV mapping file.");
    return Response.json(
      await importMappings(user.id, parseMappingCsv(input.csv)),
    );
  });
}
