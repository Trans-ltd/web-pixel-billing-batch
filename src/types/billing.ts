export interface ShopifySession {
  session_id: string;
  shop: string;
  accessToken: string;
  created_at: string;
  updated_at: string;
}

export interface PageViewEvent {
  shop: string;
  event_count: number;
}

export interface BillingRecord {
  shop: string;
  billing_date: string;
  page_views: number;
  billing_amount: number;
  rate_per_million: number;
}

export interface BillingConfig {
  ratePerMillion: number;
  timezone: string;
  billingTime: string;
}