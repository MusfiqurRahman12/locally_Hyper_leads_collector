// Shared TypeScript types for the Local Prospect Finder platform

export interface Prospect {
  id: string;
  name: string;
  category?: string;
  sub_categories?: string[];
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  email?: string;
  maps_url?: string;
  google_rating?: number;
  review_count?: number;
  business_status?: string;
  description?: string;
  social_links?: Record<string, string>;
  lead_score?: number;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  owner_name?: string;
  contact_details?: Record<string, any>;
  data_source?: string;
  last_scan_date?: string;
  created_at?: string;
  scan?: ScanStatus;
  audit_results?: AuditResults;
  pain_points?: PainPoint[];
  recommended_services?: RecommendedService[];
}

export interface ScanStatus {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  progress_pct: number;
  current_stage?: string;
  triggered_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface AuditResult {
  score?: number;
  data?: Record<string, unknown>;
  findings?: Finding[];
}

export interface AuditResults {
  SEO?: AuditResult;
  PERFORMANCE?: AuditResult;
  SECURITY?: AuditResult;
  TECHNOLOGY?: AuditResult;
  MARKETING?: AuditResult;
  SOCIAL?: AuditResult;
  WEBSITE?: AuditResult;
}

export interface Finding {
  finding: string;
  evidence: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
}

export interface PainPoint {
  finding: string;
  evidence: string;
  business_impact: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
}

export interface RecommendedService {
  service: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ProspectListResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  prospects: Prospect[];
}

export interface SearchRequest {
  lat?: number;
  lng?: number;
  address?: string;
  radius_km: number;
  category: string;
  keyword?: string;
  max_results: number;
}

export interface SearchResponse {
  total: number;
  prospects_created: number;
  prospects_existing: number;
  lat: number;
  lng: number;
  radius_km: number;
  category: string;
  location_name?: string;
  city?: string;
  state?: string;
}

export interface Category {
  key: string;
  label: string;
}

export interface AppSettings {
  has_pagespeed_key: boolean;
  has_wappalyzer_key: boolean;
  has_google_places_key: boolean;
  environment: string;
  scan_concurrency: number;
  discovery_source: string;
}

export type SortField = 'lead_score' | 'name' | 'city' | 'created_at' | 'review_count';
export type SortDir = 'asc' | 'desc';
export type PriorityFilter = 'HIGH' | 'MEDIUM' | 'LOW' | '';
