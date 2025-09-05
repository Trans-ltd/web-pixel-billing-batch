import { BigQuery } from '@google-cloud/bigquery';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ShopifySession, PageViewEvent, BillingRecord } from '../types/billing';

dayjs.extend(utc);
dayjs.extend(timezone);

export class BigQueryService {
  private bigquery: BigQuery;
  private projectId: string;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || 'growth-force-project';
    this.bigquery = new BigQuery({ projectId: this.projectId });
  }

  async getActiveShopifySessions(): Promise<ShopifySession[]> {
    const query = `
      SELECT 
        shop AS shop_domain,
        accessToken,
        createdAt AS created_at,
        updatedAt AS updated_at
      FROM \`${this.projectId}.session_manager.shopify_sessions\`
      WHERE accessToken IS NOT NULL
        AND accessToken != ''
        AND shop IS NOT NULL
        AND shop != ''
    `;

    const [rows] = await this.bigquery.query(query);
    // session_idを生成（shopをそのまま使用）
    return rows.map((row: any) => ({
      ...row,
      session_id: row.shop_domain
    })) as ShopifySession[];
  }

  async getPageViewsForDate(targetDate: string): Promise<PageViewEvent[]> {
    const startDate = dayjs(targetDate).startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const endDate = dayjs(targetDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');

    const query = `
      SELECT 
        shop AS shop_domain,
        COUNT(*) as event_count
      FROM \`${this.projectId}.ad_analytics.events\`
      WHERE name = 'page_viewed'
        AND TIMESTAMP(created_at) >= TIMESTAMP('${startDate}')
        AND TIMESTAMP(created_at) < TIMESTAMP('${endDate}')
        AND shop IS NOT NULL
        AND shop != ''
      GROUP BY shop
    `;

    const [rows] = await this.bigquery.query(query);
    return rows as PageViewEvent[];
  }

  async insertBillingRecords(records: BillingRecord[]): Promise<void> {
    if (records.length === 0) {
      console.log('No billing records to insert');
      return;
    }

    const dataset = this.bigquery.dataset('billing');
    const table = dataset.table('usage_records');

    try {
      await dataset.get({ autoCreate: true });
    } catch (error) {
      console.log('Creating billing dataset...');
      await dataset.create();
    }

    try {
      await table.get();
    } catch (error) {
      console.log('Creating usage_records table...');
      await table.create({
        schema: [
          { name: 'shop_domain', type: 'STRING', mode: 'REQUIRED' },
          { name: 'billing_date', type: 'DATE', mode: 'REQUIRED' },
          { name: 'page_views', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'billing_amount', type: 'FLOAT', mode: 'REQUIRED' },
          { name: 'rate_per_million', type: 'FLOAT', mode: 'REQUIRED' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
      });
    }

    const rowsToInsert = records.map(record => ({
      ...record,
      created_at: new Date().toISOString(),
    }));

    await table.insert(rowsToInsert);
    console.log(`Inserted ${records.length} billing records`);
  }

  async getBillingRecordsForDate(targetDate: string): Promise<BillingRecord[]> {
    const query = `
      SELECT 
        shop_domain,
        billing_date,
        page_views,
        billing_amount,
        rate_per_million
      FROM \`${this.projectId}.billing.usage_records\`
      WHERE billing_date = DATE('${targetDate}')
    `;

    try {
      const [rows] = await this.bigquery.query(query);
      return rows as BillingRecord[];
    } catch (error) {
      console.log('Billing records table does not exist yet');
      return [];
    }
  }
}