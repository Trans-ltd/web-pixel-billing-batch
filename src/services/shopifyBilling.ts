import axios from 'axios';
import pLimit from 'p-limit';
import { ShopifySession } from '../types/billing';

export interface UsageChargeResult {
  shop: string;
  chargeId?: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  amount?: number;
}

interface GraphQLResponse {
  data?: {
    appUsageRecordCreate?: {
      appUsageRecord?: {
        id: string;
      };
      userErrors?: Array<{
        field: string[];
        message: string;
      }>;
    };
    currentAppInstallation?: {
      activeSubscriptions?: Array<{
        lineItems?: Array<{
          id: string;
          plan?: {
            pricingDetails?: {
              __typename: string;
            };
          };
        }>;
      }>;
    };
  };
  errors?: Array<{
    message: string;
    extensions?: {
      code: string;
    };
  }>;
}

export class ShopifyBillingService {
  private apiVersion: string;
  private concurrencyLimit: ReturnType<typeof pLimit>;
  private maxRetries: number;
  private retryDelay: number;

  constructor() {
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.concurrencyLimit = pLimit(parseInt(process.env.BATCH_SIZE || '5'));
    this.maxRetries = parseInt(process.env.MAX_RETRIES || '3');
    this.retryDelay = 1000; // Start with 1 second
  }

  async chargeShops(
    sessions: ShopifySession[],
    charges: Map<string, number>
  ): Promise<UsageChargeResult[]> {
    console.log(`Processing charges for ${sessions.length} shops`);

    const promises = sessions.map((session) =>
      this.concurrencyLimit(async () => {
        const amount = charges.get(session.shop) || 0;
        
        if (amount <= 0) {
          return {
            shop: session.shop,
            status: 'skipped' as const,
            amount: 0,
          };
        }

        return this.chargeShopWithRetry(session, amount);
      })
    );

    const results = await Promise.all(promises);
    
    const successful = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    
    console.log(`Charge results: ${successful} successful, ${failed} failed, ${skipped} skipped`);
    
    return results;
  }

  private async chargeShopWithRetry(
    session: ShopifySession,
    amount: number,
    attempt: number = 1
  ): Promise<UsageChargeResult> {
    try {
      const subscriptionLineItemId = await this.getSubscriptionLineItemId(session);
      
      if (!subscriptionLineItemId) {
        return {
          shop: session.shop,
          status: 'failed',
          error: 'No active usage-based subscription found',
          amount,
        };
      }

      const chargeId = await this.createUsageCharge(
        session,
        subscriptionLineItemId,
        amount
      );

      return {
        shop: session.shop,
        chargeId,
        status: 'success',
        amount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying charge for ${session.shop} after ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.chargeShopWithRetry(session, amount, attempt + 1);
      }

      console.error(`Failed to charge ${session.shop} after ${this.maxRetries} attempts:`, errorMessage);
      
      return {
        shop: session.shop,
        status: 'failed',
        error: errorMessage,
        amount,
      };
    }
  }

  private async getSubscriptionLineItemId(session: ShopifySession): Promise<string | null> {
    const query = `
      query {
        currentAppInstallation {
          activeSubscriptions {
            lineItems {
              id
              plan {
                pricingDetails {
                  __typename
                }
              }
            }
          }
        }
      }
    `;

    const response = await this.makeGraphQLRequest<GraphQLResponse>(
      session,
      query
    );

    const subscriptions = response.data?.currentAppInstallation?.activeSubscriptions;
    
    if (!subscriptions || subscriptions.length === 0) {
      return null;
    }

    for (const subscription of subscriptions) {
      const lineItems = subscription.lineItems || [];
      for (const item of lineItems) {
        if (item.plan?.pricingDetails?.__typename === 'AppUsagePricing') {
          return item.id;
        }
      }
    }

    return null;
  }

  private async createUsageCharge(
    session: ShopifySession,
    subscriptionLineItemId: string,
    amount: number
  ): Promise<string> {
    const mutation = `
      mutation appUsageRecordCreate($subscriptionLineItemId: ID!, $price: Money!, $description: String!) {
        appUsageRecordCreate(
          subscriptionLineItemId: $subscriptionLineItemId,
          price: $price,
          description: $description
        ) {
          appUsageRecord {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      subscriptionLineItemId,
      price: {
        amount: amount.toFixed(2),
        currencyCode: 'USD'
      },
      description: `Web pixel usage charges - ${new Date().toISOString().split('T')[0]}`
    };

    const response = await this.makeGraphQLRequest<GraphQLResponse>(
      session,
      mutation,
      variables
    );

    const userErrors = response.data?.appUsageRecordCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`GraphQL errors: ${userErrors.map(e => e.message).join(', ')}`);
    }

    const chargeId = response.data?.appUsageRecordCreate?.appUsageRecord?.id;
    if (!chargeId) {
      throw new Error('Failed to create usage charge - no charge ID returned');
    }

    return chargeId;
  }

  private async makeGraphQLRequest<T>(
    session: ShopifySession,
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    // Ensure shop domain has .myshopify.com suffix
    const shopDomain = session.shop.includes('.myshopify.com') 
      ? session.shop 
      : `${session.shop}.myshopify.com`;
    
    const url = `https://${shopDomain}/admin/api/${this.apiVersion}/graphql.json`;
    
    try {
      const response = await axios.post<T>(
        url,
        { query, variables },
        {
          headers: {
            'X-Shopify-Access-Token': session.accessToken,
            'Content-Type': 'application/json',
          },
          timeout: parseInt(process.env.API_TIMEOUT_SECONDS || '30') * 1000,
        }
      );

      const responseData = response.data as { errors?: Array<{ message: string }> };
      if (responseData.errors) {
        throw new Error(`GraphQL errors: ${responseData.errors.map((e) => e.message).join(', ')}`);
      }

      return response.data as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid access token');
        }
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded');
        }
        if (error.response && error.response.status && error.response.status >= 500) {
          throw new Error(`Shopify API error: ${error.response.status}`);
        }
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  async testConnection(session: ShopifySession): Promise<boolean> {
    try {
      const query = `
        query {
          shop {
            name
          }
        }
      `;

      await this.makeGraphQLRequest(session, query);
      return true;
    } catch (error) {
      console.error(`Connection test failed for ${session.shop}:`, error);
      return false;
    }
  }
}