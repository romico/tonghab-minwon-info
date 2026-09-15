import type { Complaint, ComplaintInput } from "@/schema";
import { apiRequest } from "./client";

export async function apiListComplaints(): Promise<Complaint[]> {
  const data = await apiRequest<{ complaints: Complaint[] }>("/api/complaints");
  return data.complaints;
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
  return data.complaints;
}

export async function apiDeleteComplaint(id: string): Promise<void> {
  await apiRequest(`/api/complaints/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function apiResetSeed(password: string): Promise<Complaint[]> {
  const data = await apiRequest<{ complaints: Complaint[] }>(
    "/api/complaints/reset-seed",
    { method: "POST", body: JSON.stringify({ password }) },
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
