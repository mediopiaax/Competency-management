import { cookies } from "next/headers";
import { workspaces, type Workspace } from "@/lib/db";

const COOKIE = "workspace";

export async function currentWorkspace(): Promise<Workspace | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  return id ? workspaces.get(id) : null;
}
export async function selectWorkspace(id: string) {
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
export async function leaveWorkspace() {
  (await cookies()).delete(COOKIE);
}
export const noWorkspace = () => Response.json({ error: "작업 공간을 먼저 선택하세요" }, { status: 401 });
export const fail = (message: string, status = 400) => Response.json({ error: message }, { status });
