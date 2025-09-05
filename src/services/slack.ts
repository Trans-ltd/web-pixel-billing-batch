import { WebClient } from '@slack/web-api';
import { ShopBillingResult } from '../types/billing';

export class SlackService {
  private client: WebClient;
  private channelId: string;
  private isDummyToken: boolean;

  constructor() {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_IDS || process.env.SLACK_CHANNEL_ID;

    if (!botToken) {
      throw new Error('SLACK_BOT_TOKEN environment variable is required');
    }
    if (!channelId) {
      throw new Error('SLACK_CHANNEL_IDS environment variable is required');
    }

    this.isDummyToken = botToken === 'dummy-token-for-startup';
    if (this.isDummyToken) {
      console.warn('Using dummy Slack token - Slack notifications will be disabled');
    }

    this.client = new WebClient(botToken);
    this.channelId = channelId;
  }

  async sendBatchResult(result: {
    success: boolean;
    message: string;
    timestamp: string;
    error?: string;
    scheduled?: boolean;
    testDate?: string;
    billingDetails?: {
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
    };
  }): Promise<void> {
    if (this.isDummyToken) {
      console.log('Slack notification skipped (dummy token):', result.message);
      return;
    }

    try {
      const { success, message, timestamp, error, scheduled, testDate, billingDetails } = result;
      
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: success ? '✅ バッチ処理完了' : '❌ バッチ処理エラー'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*ステータス:*\n${success ? '成功' : '失敗'}`
            },
            {
              type: 'mrkdwn',
              text: `*実行時刻:*\n${timestamp}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*メッセージ:*\n${message}`
          }
        }
      ];

      // Add billing details if available
      if (billingDetails) {
        const { targetDate, skipped, skipReason, activeSessions, shopsWithPageViews, billingRecordsGenerated, totalPageViews, totalAmount, chargeResults, shopResults, errorDetails } = billingDetails;
        
        blocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*処理対象日:*\n${targetDate}`
            },
            {
              type: 'mrkdwn',
              text: `*処理結果:*\n${skipped ? '⏭️ スキップ' : '✅ 実行'}`
            }
          ]
        });

        if (skipped && skipReason) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*スキップ理由:*\n${skipReason}`
            }
          });
        }

        if (!skipped) {
          blocks.push({
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*アクティブセッション数:*\n${activeSessions.toLocaleString()}`
              },
              {
                type: 'mrkdwn',
                text: `*ページビューのあるショップ数:*\n${shopsWithPageViews.toLocaleString()}`
              }
            ]
          });

          blocks.push({
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*請求レコード数:*\n${billingRecordsGenerated.toLocaleString()}`
              },
              {
                type: 'mrkdwn',
                text: `*総ページビュー数:*\n${totalPageViews.toLocaleString()}`
              }
            ]
          });

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*総請求金額:*\n$${totalAmount.toFixed(2)}`
            }
          });

          // Add charge results summary if available
          if (chargeResults && chargeResults.length > 0) {
            const successfulCharges = chargeResults.filter(r => r.status === 'success').length;
            const failedCharges = chargeResults.filter(r => r.status === 'failed').length;
            const skippedCharges = chargeResults.filter(r => r.status === 'skipped').length;

            blocks.push({
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Shopify請求結果:*\n✅ 成功: ${successfulCharges}\n❌ 失敗: ${failedCharges}\n⏭️ スキップ: ${skippedCharges}`
                }
              ]
            });
          }

        }

        // Add error details if available
        if (errorDetails) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🔴 エラー詳細:*\n\`\`\`${errorDetails.message}\`\`\``
            }
          });

          if (errorDetails.stack) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🔍 スタックトレース:*\n\`\`\`${errorDetails.stack.substring(0, 1000)}\`\`\``
              }
            });
          }
        }

        // Add detailed shop-by-shop results if available (for both skipped and non-skipped)
        // Filter out shops with 0 page views for cleaner display
        const shopsWithActivity = shopResults?.filter(shop => shop.pageViews > 0) || [];
        
        if (shopsWithActivity.length > 0) {
          blocks.push({
            type: 'divider'
          } as any);

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📊 ショップ別処理結果:*'
            }
          });

          // Group results for better display - show first few shops with details
          const maxShopsToShow = 10;
          const shopsToShow = shopsWithActivity.slice(0, maxShopsToShow);
          
          let detailText = '';
          shopsToShow.forEach(shop => {
            const bigQueryIcon = shop.bigQuerySaved ? '✅' : '❌';
            const shopifyIcon = shop.shopifyStatus === 'success' ? '✅' : 
                              shop.shopifyStatus === 'failed' ? '❌' : 
                              shop.shopifyStatus === 'skipped' ? '⏭️' : '⏳';
            
            detailText += `*${shop.shop}*\n`;
            detailText += `📊 ${shop.pageViews.toLocaleString()} views / $${shop.billingAmount}\n`;
            detailText += `${bigQueryIcon} BigQuery ${shop.bigQuerySaved ? '保存成功' : '保存失敗'}\n`;
            detailText += `${shopifyIcon} Shopify ${this.getShopifyStatusText(shop.shopifyStatus)}`;
            
            if (shop.bigQueryError) {
              detailText += `\n🔴 BigQuery エラー: ${shop.bigQueryError}`;
            }
            if (shop.shopifyError) {
              detailText += `\n🔴 Shopify エラー: ${shop.shopifyError}`;
            }
            
            detailText += '\n\n';
          });

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: detailText.trim()
            }
          });

          // If there are more active shops, show a summary
          if (shopsWithActivity.length > maxShopsToShow) {
            const remainingCount = shopsWithActivity.length - maxShopsToShow;
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `_... 他 ${remainingCount} ショップの結果は省略_`
              }
            });
          }
        }
      }

      if (scheduled !== undefined) {
        blocks.splice(-1, 0, {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*実行タイプ:*\n${scheduled ? 'スケジュール実行' : '手動実行'}`
          }
        });
      }

      if (testDate) {
        blocks.splice(-1, 0, {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*テスト対象日:*\n${testDate}`
          }
        });
      }

      if (error) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*エラー詳細:*\n\`\`\`${error}\`\`\``
          }
        });
      }

      await this.client.chat.postMessage({
        channel: this.channelId,
        blocks,
        text: success ? 'バッチ処理が完了しました' : 'バッチ処理でエラーが発生しました'
      });

      console.log('Slack notification sent successfully');
    } catch (slackError) {
      console.error('Failed to send Slack notification:', slackError);
      // Don't throw here to avoid breaking the main process
    }
  }

  private getShopifyStatusText(status: 'pending' | 'success' | 'failed' | 'skipped'): string {
    switch (status) {
      case 'success': return '請求成功';
      case 'failed': return '請求失敗';
      case 'skipped': return '請求スキップ';
      case 'pending': return '請求待機';
      default: return '不明';
    }
  }
}