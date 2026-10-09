"use client";

import { useEffect, useState } from "react";

let cache: Promise<string[]> | null = null;
const loadFiles = () => (cache ??= fetch("/api/avatars").then((r) => r.json()).then((d) => d.files as string[]).catch(() => []));

const base = (file: string) => file.replace(/\.[^.]+$/, "");
const TINTS = ["from-[#8f7bff] to-[#5aa2ff]", "from-[#5aa2ff] to-[#4fd1c5]", "from-[#ff9f7b] to-[#ff6b9d]", "from-[#7bd88f] to-[#3fb6a8]", "from-[#ffc45a] to-[#ff8f5a]", "from-[#b68cff] to-[#ff8fd0]"];

/**
 * 대상자 캐릭터. public/avatars에 이름·학번과 같은 파일이 있으면 그것을, 없으면 이름에 번호가 든 파일(1.png, stu1_icon.png)을 순서대로 쓴다.
 * 이미지가 없으면 이름 첫 글자가 든 색 원을 그린다.
 */
export function Avatar({ name, studentId, index = 0, className = "h-12 w-12 text-lg", cutout = false }: { name: string; studentId?: string | null; index?: number; className?: string; cutout?: boolean }) {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => { loadFiles().then(setFiles); }, []);

  const own = files.find((f) => base(f) === name || (studentId && base(f) === studentId));
  const shared = files.filter((f) => /\d/.test(base(f)) && !/^\d{6,}$/.test(base(f)));
  const file = own ?? (shared.length > 0 ? shared[index % shared.length] : null);

  if (file) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/avatars/${encodeURIComponent(file)}`} alt={`${name} 캐릭터`} className={`shrink-0 object-contain ${cutout ? "drop-shadow-xl" : "rounded-full bg-fill object-cover"} ${className}`} />;
  }
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${TINTS[index % TINTS.length]} ${className}`}>
      {name.slice(0, 1)}
    </span>
  );
}
