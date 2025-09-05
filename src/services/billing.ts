import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { BigQueryService } from './bigquery';
import { ShopifyBillingService } from './shopifyBilling';
import { BillingRecord, BillingConfig, ShopifySession, PageViewEvent, ShopBillingResult } from '../types/billing';

dayjs.extend(utc);
dayjs.extend(timezone);

export class BillingService {
  private bigQueryService: BigQueryService;
  private shopifyBillingService: ShopifyBillingService;
  private config: BillingConfig;

  constructor() {
    this.bigQueryService = new BigQueryService();
    this.shopifyBillingService = new ShopifyBillingService();
    this.config = {
      ratePerMillion: 10.0, // $10 per 1 million page views
      timezone: 'Asia/Tokyo',
      billingTime: '01:00', // 25:00 = 01:00 next day
    };
  }

  async processDailyBilling(): Promise<{
    success: boolean;
    targetDate: string;
    skipped: boolean;
    skipReason?: string;
    activeSessions: number;
    shopsWithPageViews: number;
    billingRecordsGenerated: number;
    totalPageViews: number;
    totalAmount: number;
    chargeResults?: any[];
    shopResults?: ShopBillingResult[];
    errorDetails?: {
      message: string;
      timestamp: string;
      stack?: string;
    };
  }> {
    try {
      console.log('Starting daily billing process...');
      
      // Get yesterday's date in JST (since we run at 01:00 JST, we bill for previous day)
      const targetDate = this.getTargetBillingDate();
      console.log(`Processing billing for date: ${targetDate}`);


      // Get active Shopify sessions
      const sessions = await this.bigQueryService.getActiveShopifySessions();
      console.log(`Found ${sessions.length} active Shopify sessions`);

      if (sessions.length === 0) {
        console.log('No active sessions found. Skipping billing.');
        return {
          success: true,
          targetDate,
          skipped: true,
          skipReason: 'No active sessions found',
          activeSessions: 0,
          shopsWithPageViews: 0,
          billingRecordsGenerated: 0,
          totalPageViews: 0,
          totalAmount: 0
        };
      }

      // Get page view events for the target date
      const pageViews = await this.bigQueryService.getPageViewsForDate(targetDate);
      console.log(`Found page view data for ${pageViews.length} shops`);

      // Generate billing records
      const billingRecords = this.generateBillingRecords(sessions, pageViews, targetDate);
      console.log(`Generated ${billingRecords.length} billing records`);
      
      let chargeResults: any[] = [];
      const shopResults: ShopBillingResult[] = [];

      // Insert billing records to BigQuery first
      if (billingRecords.length > 0) {
        // Mark all records as pending
        const recordsWithStatus = billingRecords.map(record => ({
          ...record,
          shopify_billing_status: 'pending' as const,
        }));
        
        // Try to insert billing records to BigQuery and track results per shop
        try {
          await this.bigQueryService.insertBillingRecords(recordsWithStatus);
          console.log(`Inserted ${billingRecords.length} billing records to BigQuery`);
          
          // Initialize shop results with successful BigQuery saves
          billingRecords.forEach(record => {
            shopResults.push({
              shop: record.shop,
              pageViews: record.page_views,
              billingAmount: record.billing_amount,
              bigQuerySaved: true,
              shopifyStatus: 'pending'
            });
          });
        } catch (bigQueryError) {
          console.error('Failed to insert billing records to BigQuery:', bigQueryError);
          
          // Initialize shop results with failed BigQuery saves
          billingRecords.forEach(record => {
            shopResults.push({
              shop: record.shop,
              pageViews: record.page_views,
              billingAmount: record.billing_amount,
              bigQuerySaved: false,
              bigQueryError: bigQueryError instanceof Error ? bigQueryError.message : 'Unknown BigQuery error',
              shopifyStatus: 'skipped'
            });
          });
          
          // If BigQuery fails, we shouldn't proceed with Shopify charges
          throw bigQueryError;
        }
        
        // Process Shopify charges
        console.log('Processing Shopify charges...');
        const chargeMap = new Map(
          billingRecords.map(record => [record.shop, record.billing_amount])
        );
        
        chargeResults = await this.shopifyBillingService.chargeShops(sessions, chargeMap);
        
        // Create new records with Shopify charge results for insertion (avoiding UPDATE due to streaming buffer)
        const updatedRecords: BillingRecord[] = billingRecords.map(record => {
          const chargeResult = chargeResults.find(r => r.shop === record.shop);
          if (chargeResult) {
            // Map 'skipped' status to 'pending' for compatibility with BillingRecord type
            const billingStatus: 'pending' | 'success' | 'failed' = 
              chargeResult.status === 'skipped' ? 'pending' : chargeResult.status;
            
            return {
              ...record,
              shopify_charge_id: chargeResult.chargeId,
              shopify_billing_status: billingStatus,
              shopify_error_message: chargeResult.error,
              shopify_processed_at: chargeResult.status === 'success' ? new Date().toISOString() : undefined,
            };
          }
          return record;
        });

        // Update shop results with Shopify charge results
        shopResults.forEach(shopResult => {
          const chargeResult = chargeResults.find(r => r.shop === shopResult.shop);
          if (chargeResult) {
            shopResult.shopifyStatus = chargeResult.status as 'pending' | 'success' | 'failed' | 'skipped';
            shopResult.shopifyChargeId = chargeResult.chargeId;
            shopResult.shopifyError = chargeResult.error;
          }
        });
        
        // Insert updated records as new rows instead of UPDATE to avoid streaming buffer constraints
        await this.bigQueryService.insertBillingRecords(updatedRecords);
        console.log('Inserted updated billing records with Shopify charge results');
        console.log('Daily billing process completed successfully');
      } else {
        console.log('No billing records to insert');
      }

      // Log summary
      const totalAmount = billingRecords.reduce((sum, record) => sum + record.billing_amount, 0);
      const totalPageViews = billingRecords.reduce((sum, record) => sum + record.page_views, 0);
      
      console.log(`Billing Summary for ${targetDate}:`);
      console.log(`- Total shops billed: ${billingRecords.length}`);
      console.log(`- Total page views: ${totalPageViews.toLocaleString()}`);
      console.log(`- Total billing amount: $${totalAmount.toFixed(2)}`);

      return {
        success: true,
        targetDate,
        skipped: false,
        activeSessions: sessions.length,
        shopsWithPageViews: pageViews.length,
        billingRecordsGenerated: billingRecords.length,
        totalPageViews,
        totalAmount,
        chargeResults,
        shopResults
      };

    } catch (error) {
      console.error('Error in daily billing process:', error);
      
      // Try to provide some context about where the error occurred
      let errorContext = 'Unknown error location';
      let shopResults: ShopBillingResult[] = [];
      
      if (error instanceof Error) {
        errorContext = error.message;
        
        // If we have sessions and page views data, create failed shop results
        try {
          const sessions = await this.bigQueryService.getActiveShopifySessions();
          const pageViews = await this.bigQueryService.getPageViewsForDate(this.getTargetBillingDate());
          const billingRecords = this.generateBillingRecords(sessions, pageViews, this.getTargetBillingDate());
          
          shopResults = billingRecords.map(record => ({
            shop: record.shop,
            pageViews: record.page_views,
            billingAmount: record.billing_amount,
            bigQuerySaved: false,
            bigQueryError: errorContext,
            shopifyStatus: 'skipped' as const,
            shopifyError: 'Process failed before Shopify billing'
          }));
        } catch (contextError) {
          console.error('Error creating context for failed billing:', contextError);
        }
      }
      
      // Return error details instead of throwing
      return {
        success: false,
        targetDate: this.getTargetBillingDate(),
        skipped: false,
        skipReason: `Process failed: ${errorContext}`,
        activeSessions: 0,
        shopsWithPageViews: 0,
        billingRecordsGenerated: 0,
        totalPageViews: 0,
        totalAmount: 0,
        shopResults,
        errorDetails: {
          message: errorContext,
          timestamp: new Date().toISOString(),
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  private getTargetBillingDate(): string {
    // Since we run at 01:00 JST (25:00 of previous day), we bill for the previous day
    const now = dayjs().tz(this.config.timezone);
    const targetDate = now.subtract(1, 'day');
    return targetDate.format('YYYY-MM-DD');
  }

  private generateBillingRecords(
    sessions: ShopifySession[],
    pageViews: PageViewEvent[],
    billingDate: string
  ): BillingRecord[] {
    const pageViewsMap = new Map(
      pageViews.map(pv => [pv.shop, pv.event_count])
    );

    const billingRecords: BillingRecord[] = [];

    for (const session of sessions) {
      const viewCount = pageViewsMap.get(session.shop) || 0;
      const billingAmount = this.calculateBillingAmount(viewCount);

      billingRecords.push({
        shop: session.shop,
        billing_date: billingDate,
        page_views: viewCount,
        billing_amount: billingAmount,
        rate_per_million: this.config.ratePerMillion,
      });
    }

    return billingRecords;
  }

  private calculateBillingAmount(pageViews: number): number {
    // $10 per 1 million page views
    const millionViews = pageViews / 1_000_000;
    return Math.round(millionViews * this.config.ratePerMillion * 100) / 100; // Round to 2 decimal places
  }

  async testBillingForDate(testDate: string): Promise<{
    success: boolean;
    targetDate: string;
    skipped: boolean;
    skipReason?: string;
    activeSessions: number;
    shopsWithPageViews: number;
    billingRecordsGenerated: number;
    totalPageViews: number;
    totalAmount: number;
  }> {
    console.log(`Testing billing process for date: ${testDate}`);
    
    const sessions = await this.bigQueryService.getActiveShopifySessions();
    const pageViews = await this.bigQueryService.getPageViewsForDate(testDate);
    const billingRecords = this.generateBillingRecords(sessions, pageViews, testDate);
    
    console.log('Test Results:');
    console.log(`- Active sessions: ${sessions.length}`);
    console.log(`- Shops with page views: ${pageViews.length}`);
    console.log(`- Billing records generated: ${billingRecords.length}`);
    
    const totalAmount = billingRecords.reduce((sum, record) => sum + record.billing_amount, 0);
    const totalPageViews = billingRecords.reduce((sum, record) => sum + record.page_views, 0);
    
    console.log(`- Total page views: ${totalPageViews.toLocaleString()}`);
    console.log(`- Total billing amount: $${totalAmount.toFixed(2)}`);
    
    console.log('\nSample billing records:');
    billingRecords.slice(0, 5).forEach(record => {
      console.log(`- ${record.shop}: ${record.page_views.toLocaleString()} views = $${record.billing_amount}`);
    });

    return {
      success: true,
      targetDate: testDate,
      skipped: false,
      activeSessions: sessions.length,
      shopsWithPageViews: pageViews.length,
      billingRecordsGenerated: billingRecords.length,
      totalPageViews,
      totalAmount
    };
  }

}