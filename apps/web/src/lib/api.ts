import axios from 'axios';
import type {
  Prospect,
  ProspectListResponse,
  SearchRequest,
  SearchResponse,
  ScanStatus,
  Category,
  AppSettings,
  SortField,
  SortDir,
  PriorityFilter,
} from '@/types/prospect';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 60000,
});

// ── Search & Discovery ───────────────────────────────────────────────────────

export async function searchProspects(params: SearchRequest): Promise<SearchResponse> {
  const { data } = await api.post<SearchResponse>('/search', params);
  return data;
}

export async function geocode(address: string): Promise<{ lat: number; lng: number; display_name?: string }> {
  const { data } = await api.post('/geocode', { address });
  return data;
}

export async function getCategories(): Promise<Category[]> {
  const { data } = await api.get<{ categories: Category[] }>('/categories');
  return data.categories;
}

// ── Prospects ─────────────────────────────────────────────────────────────────

export interface ProspectFilters {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  city?: string;
  state?: string;
  priority?: PriorityFilter;
  has_website?: boolean;
  min_score?: number;
  max_score?: number;
  sort_by?: SortField;
  sort_dir?: SortDir;
}

export async function listProspects(filters: ProspectFilters = {}): Promise<ProspectListResponse> {
  const params: Record<string, string | number | boolean> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) params[k] = v as string | number | boolean;
  });
  const { data } = await api.get<ProspectListResponse>('/prospects', { params });
  return data;
}

export async function getProspect(id: string): Promise<Prospect> {
  const { data } = await api.get<Prospect>(`/prospects/${id}`);
  return data;
}

export async function deleteProspect(id: string): Promise<void> {
  await api.delete(`/prospects/${id}`);
}

// ── Scans ─────────────────────────────────────────────────────────────────────

export async function triggerScan(prospectId: string): Promise<ScanStatus> {
  const { data } = await api.post<ScanStatus>('/scans', { prospect_id: prospectId });
  return data;
}

export async function triggerBulkScan(prospectIds: string[]): Promise<{ results: Array<{ prospect_id: string; scan_id?: string; status: string }> }> {
  const { data } = await api.post('/scans/bulk', { prospect_ids: prospectIds });
  return data;
}

export async function getScanStatus(scanId: string): Promise<ScanStatus> {
  const { data } = await api.get<ScanStatus>(`/scans/${scanId}`);
  return data;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function getExportUrl(format: 'csv' | 'excel' | 'json', priority?: string): string {
  const params = priority ? `?priority=${priority}` : '';
  return `${API_BASE}/api/v1/export/${format}${params}`;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const { data } = await api.get<AppSettings>('/settings');
  return data;
}
