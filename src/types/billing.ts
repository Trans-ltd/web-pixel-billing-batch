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
  shopify_charge_id?: string;
  shopify_billing_status?: 'pending' | 'success' | 'failed';
  shopify_error_message?: string;
  shopify_processed_at?: string;
}

export interface BillingConfig {
  ratePerMillion: number;
  timezone: string;
  billingTime: string;
}