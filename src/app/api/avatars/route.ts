import { readdir } from "node:fs/promises";
import path from "node:path";

/** public/avatars 폴더에 넣어 둔 캐릭터 이미지 목록 */
export async function GET() {
  const files = await readdir(path.join(process.cwd(), "public", "avatars")).catch(() => []);
  return Response.json({ files: files.filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f)).sort((a, b) => a.localeCompare(b, "ko", { numeric: true })) });
}
