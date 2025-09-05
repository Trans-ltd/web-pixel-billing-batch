import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { BigQueryService } from './bigquery';
import { BillingRecord, BillingConfig, ShopifySession, PageViewEvent } from '../types/billing';

dayjs.extend(utc);
dayjs.extend(timezone);

export class BillingService {
  private bigQueryService: BigQueryService;
  private config: BillingConfig;

  constructor() {
    this.bigQueryService = new BigQueryService();
    this.config = {
      ratePerMillion: 10.0, // $10 per 1 million page views
      timezone: 'Asia/Tokyo',
      billingTime: '01:00', // 25:00 = 01:00 next day
    };
  }

  async processDailyBilling(): Promise<void> {
    try {
      console.log('Starting daily billing process...');
      
      // Get yesterday's date in JST (since we run at 01:00 JST, we bill for previous day)
      const targetDate = this.getTargetBillingDate();
      console.log(`Processing billing for date: ${targetDate}`);

      // Check if billing already processed for this date
      const existingRecords = await this.bigQueryService.getBillingRecordsForDate(targetDate);
      if (existingRecords.length > 0) {
        console.log(`Billing already processed for ${targetDate}. Found ${existingRecords.length} existing records.`);
        return;
      }

      // Get active Shopify sessions
      const sessions = await this.bigQueryService.getActiveShopifySessions();
      console.log(`Found ${sessions.length} active Shopify sessions`);

      if (sessions.length === 0) {
        console.log('No active sessions found. Skipping billing.');
        return;
      }

      // Get page view events for the target date
      const pageViews = await this.bigQueryService.getPageViewsForDate(targetDate);
      console.log(`Found page view data for ${pageViews.length} shops`);

      // Generate billing records
      const billingRecords = this.generateBillingRecords(sessions, pageViews, targetDate);
      console.log(`Generated ${billingRecords.length} billing records`);

      // Insert billing records
      if (billingRecords.length > 0) {
        await this.bigQueryService.insertBillingRecords(billingRecords);
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

    } catch (error) {
      console.error('Error in daily billing process:', error);
      throw error;
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

  async testBillingForDate(testDate: string): Promise<void> {
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
  }
}