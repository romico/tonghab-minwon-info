import type { Complaint, ComplaintInput } from "@/schema";
import { apiRequest } from "./client";

export async function apiListComplaints(): Promise<Complaint[]> {
  const data = await apiRequest<{ complaints: Complaint[] }>("/api/complaints");
  return data.complaints;
}

export async function apiGetComplaint(id: string): Promise<Complaint> {
  const data = await apiRequest<{ complaint: Complaint }>(
    `/api/complaints/${encodeURIComponent(id)}`,
  );
  return data.complaint;
}

export async function apiUpsertComplaint(
  input: ComplaintInput,
): Promise<Complaint> {
  const data = await apiRequest<{ complaint: Complaint }>("/api/complaints", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return data.complaint;
}

export async function apiAddComplaints(
  inputs: ComplaintInput[],
): Promise<Complaint[]> {
  const data = await apiRequest<{ complaints: Complaint[]; count: number }>(
    "/api/complaints",
    {
      method: "POST",
      body: JSON.stringify({ items: inputs }),
    },
  );
  if (!Array.isArray(data.complaints) || data.complaints.length === 0) {
    throw new Error("서버가 등록 결과를 반환하지 않았습니다.");
  }
  return data.complaints;
}

export async function apiDeleteComplaint(id: string): Promise<void> {
  await apiRequest(`/api/complaints/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function apiResetSeed(
  password: string,
  totpCode?: string,
): Promise<Complaint[]> {
  const data = await apiRequest<{ complaints: Complaint[] }>(
    "/api/complaints/reset-seed",
    {
      method: "POST",
      body: JSON.stringify({
        password,
        ...(totpCode ? { totpCode } : {}),
      }),
    },
  );
  return data.complaints;
}

export async function apiReplaceComplaints(
  complaints: Complaint[],
): Promise<Complaint[]> {
  const data = await apiRequest<{ complaints: Complaint[] }>(
    "/api/complaints/replace",
    {
      method: "POST",
      body: JSON.stringify({ complaints }),
    },
  );
  return data.complaints;
}
