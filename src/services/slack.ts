import { WebClient } from '@slack/web-api';

export class SlackService {
  private client: WebClient;
  private channelId: string;

  constructor() {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_IDS;

    if (!botToken) {
      throw new Error('SLACK_BOT_TOKEN environment variable is required');
    }
    if (!channelId) {
      throw new Error('SLACK_CHANNEL_IDS environment variable is required');
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
  }): Promise<void> {
    try {
      const { success, message, timestamp, error, scheduled, testDate } = result;
      
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
}