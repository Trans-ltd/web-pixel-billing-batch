// Mock p-limit before importing the service
jest.mock('p-limit', () => {
  return jest.fn(() => (fn: () => Promise<unknown>) => fn());
});

import { ShopifyBillingService } from '../services/shopifyBilling';
import { ShopifySession } from '../types/billing';

describe('ShopifyBillingService', () => {
  let service: ShopifyBillingService;

  beforeEach(() => {
    service = new ShopifyBillingService();
  });

  describe('chargeShops', () => {
    it('should skip shops with zero amount', async () => {
      const sessions: ShopifySession[] = [
        {
          session_id: 'test-1',
          shop: 'test-shop-1.myshopify.com',
          accessToken: 'test-token-1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];

      const charges = new Map([['test-shop-1.myshopify.com', 0]]);

      const results = await service.chargeShops(sessions, charges);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        shop: 'test-shop-1.myshopify.com',
        status: 'skipped',
        amount: 0,
      });
    });

    it('should handle multiple shops in batch', async () => {
      const sessions: ShopifySession[] = [
        {
          session_id: 'test-1',
          shop: 'test-shop-1.myshopify.com',
          accessToken: 'test-token-1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        {
          session_id: 'test-2',
          shop: 'test-shop-2.myshopify.com',
          accessToken: 'test-token-2',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
        {
          session_id: 'test-3',
          shop: 'test-shop-3.myshopify.com',
          accessToken: 'test-token-3',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];

      const charges = new Map([
        ['test-shop-1.myshopify.com', 0],
        ['test-shop-2.myshopify.com', 10.50],
        ['test-shop-3.myshopify.com', 25.00],
      ]);

      // Mock the actual API calls
      jest.spyOn(service as unknown as { chargeShopWithRetry: typeof service['chargeShopWithRetry'] }, 'chargeShopWithRetry').mockImplementation(
        async (session: ShopifySession, amount: number) => {
          return {
            shop: session.shop,
            chargeId: `charge-${session.shop}`,
            status: 'success',
            amount,
          };
        }
      );

      const results = await service.chargeShops(sessions, charges);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('skipped');
      expect(results[1].status).toBe('success');
      expect(results[2].status).toBe('success');
      expect(results[1].amount).toBe(10.50);
      expect(results[2].amount).toBe(25.00);
    });
  });

  describe('testConnection', () => {
    it('should return false for invalid access token', async () => {
      const session: ShopifySession = {
        session_id: 'test-1',
        shop: 'test-shop.myshopify.com',
        accessToken: 'invalid-token',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      // Mock the GraphQL request to throw an error
      jest.spyOn(service as unknown as { makeGraphQLRequest: typeof service['makeGraphQLRequest'] }, 'makeGraphQLRequest').mockRejectedValue(
        new Error('Invalid access token')
      );

      const result = await service.testConnection(session);
      expect(result).toBe(false);
    });
  });
});