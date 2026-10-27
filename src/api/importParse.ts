import type { CardImportDraft } from "@/import/cardFieldExtract";

export async function apiParseImportFiles(
  files: FileList | File[],
): Promise<{ drafts: CardImportDraft[]; errors: string[] }> {
  const list = Array.from(files);
  const form = new FormData();
  for (const file of list) {
    form.append("files", file, file.name);
  }
  const res = await fetch("/api/import/parse", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as {
    drafts?: CardImportDraft[];
    errors?: string[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `문서 인식 실패 (${res.status})`);
  }
  return {
    drafts: data.drafts ?? [],
    errors: data.errors ?? [],
  };
}
