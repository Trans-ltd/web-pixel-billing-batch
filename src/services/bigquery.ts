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
        shop,
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
    return rows.map((row: Record<string, unknown>) => ({
      ...row,
      session_id: (row as unknown as ShopifySession).shop
    })) as ShopifySession[];
  }

  async getPageViewsForDate(targetDate: string): Promise<PageViewEvent[]> {
    const query = `
      SELECT 
        REGEXP_REPLACE(shop, r'\\.myshopify\\.com$', '') AS shop,
        COUNT(*) as event_count
      FROM \`${this.projectId}.ad_analytics.events\`
      WHERE name = 'page_viewed'
        AND DATE(created_at) = DATE('${targetDate}')
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
      
      // Check if we need to add new columns
      const [metadata] = await table.getMetadata();
      const existingFields = metadata.schema.fields.map((field: any) => field.name);
      
      const requiredFields = [
        'shopify_charge_id',
        'shopify_billing_status', 
        'shopify_error_message',
        'shopify_processed_at'
      ];
      
      const missingFields = requiredFields.filter(field => !existingFields.includes(field));
      
      if (missingFields.length > 0) {
        console.log(`Adding missing fields to usage_records table: ${missingFields.join(', ')}`);
        
        const newSchema = [...metadata.schema.fields];
        
        if (missingFields.includes('shopify_charge_id')) {
          newSchema.push({ name: 'shopify_charge_id', type: 'STRING', mode: 'NULLABLE' });
        }
        if (missingFields.includes('shopify_billing_status')) {
          newSchema.push({ name: 'shopify_billing_status', type: 'STRING', mode: 'NULLABLE' });
        }
        if (missingFields.includes('shopify_error_message')) {
          newSchema.push({ name: 'shopify_error_message', type: 'STRING', mode: 'NULLABLE' });
        }
        if (missingFields.includes('shopify_processed_at')) {
          newSchema.push({ name: 'shopify_processed_at', type: 'TIMESTAMP', mode: 'NULLABLE' });
        }
        
        await table.setMetadata({ schema: { fields: newSchema } });
        console.log('Successfully added new fields to usage_records table');
      }
      
    } catch (error) {
      console.log('Creating usage_records table...');
      await table.create({
        schema: [
          { name: 'shop', type: 'STRING', mode: 'REQUIRED' },
          { name: 'billing_date', type: 'DATE', mode: 'REQUIRED' },
          { name: 'page_views', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'billing_amount', type: 'FLOAT', mode: 'REQUIRED' },
          { name: 'rate_per_million', type: 'FLOAT', mode: 'REQUIRED' },
          { name: 'shopify_charge_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'shopify_billing_status', type: 'STRING', mode: 'NULLABLE' },
          { name: 'shopify_error_message', type: 'STRING', mode: 'NULLABLE' },
          { name: 'shopify_processed_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
      });
    }

    const rowsToInsert = records.map(record => ({
      ...record,
      created_at: new Date().toISOString(),
    }));

    try {
      await table.insert(rowsToInsert);
      console.log(`Inserted ${records.length} billing records`);
    } catch (error: any) {
      console.error('BigQuery insert error:', error);
      if (error.errors && error.errors.length > 0) {
        console.error('Detailed errors:', JSON.stringify(error.errors[0], null, 2));
      }
      throw error;
    }
  }

  async getBillingRecordsForDate(targetDate: string): Promise<BillingRecord[]> {
    const query = `
      SELECT 
        shop,
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

  async updateBillingRecords(records: BillingRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const query = records.map(record => `
      UPDATE \`${this.projectId}.billing.usage_records\`
      SET 
        shopify_charge_id = '${record.shopify_charge_id || ''}',
        shopify_billing_status = '${record.shopify_billing_status || 'pending'}',
        shopify_error_message = ${record.shopify_error_message ? `'${record.shopify_error_message}'` : 'NULL'},
        shopify_processed_at = ${record.shopify_processed_at ? `TIMESTAMP('${record.shopify_processed_at}')` : 'NULL'}
      WHERE shop = '${record.shop}' AND billing_date = DATE('${record.billing_date}')
    `).join(';\n');

    try {
      await this.bigquery.query(query);
      console.log(`Updated ${records.length} billing records with Shopify charge status`);
    } catch (error) {
      console.error('Error updating billing records:', error);
      throw error;
    }
  }
}