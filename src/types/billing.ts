export interface ShopifySession {
  session_id: string;
  shop_domain: string;
  access_token: string;
  created_at: string;
  updated_at: string;
}

export interface PageViewEvent {
  shop_domain: string;
  event_count: number;
}

export interface BillingRecord {
  shop_domain: string;
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