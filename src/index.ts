import { http, HttpFunction } from '@google-cloud/functions-framework';
import { BillingService } from './services/billing';
import { SlackService } from './services/slack';

// Ensure environment variables are set with defaults for Cloud Functions
process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'dummy-token-for-startup';
process.env.SLACK_CHANNEL_IDS = process.env.SLACK_CHANNEL_IDS || process.env.SLACK_CHANNEL_ID || 'C07NR0MM9QK';

const billingService = new BillingService();
const slackService = new SlackService();

export const processBilling: HttpFunction = async (req, res) => {
  console.log('Billing batch process started');
  
  try {
    // Check if this is a scheduled trigger from Cloud Scheduler
    const isScheduledTrigger = req.headers['x-cloudscheduler-job'] || 
                              req.headers['user-agent']?.includes('Google-Cloud-Scheduler');
    
    // Process daily billing
    const billingResult = await billingService.processDailyBilling();
    
    const result = {
      success: true,
      message: billingResult.skipped ? 
        `Billing process skipped: ${billingResult.skipReason}` : 
        'Billing process completed successfully',
      timestamp: new Date().toISOString(),
      scheduled: !!isScheduledTrigger,
      billingDetails: billingResult
    };
    
    // Send result to Slack
    await slackService.sendBatchResult(result);
    
    res.status(200).json(result);
    
  } catch (error) {
    console.error('Error processing billing:', error);
    
    // Try to get detailed error information from billing service
    // Since we modified billing service to return error details instead of throwing,
    // this catch block should rarely be hit unless there's an error in calling the service itself
    const errorResult = {
      success: false,
      message: 'Billing process failed unexpectedly',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      billingDetails: {
        success: false,
        targetDate: new Date().toISOString().split('T')[0],
        skipped: false,
        skipReason: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        activeSessions: 0,
        shopsWithPageViews: 0,
        billingRecordsGenerated: 0,
        totalPageViews: 0,
        totalAmount: 0,
        errorDetails: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          stack: error instanceof Error ? error.stack : undefined
        }
      }
    };
    
    // Send error result to Slack
    await slackService.sendBatchResult(errorResult);
    
    res.status(500).json(errorResult);
  }
};

export const testBilling: HttpFunction = async (req, res) => {
  console.log('Test billing process started');
  
  try {
    const { date } = req.query;
    const testDate = typeof date === 'string' ? date : new Date().toISOString().split('T')[0];
    
    const billingResult = await billingService.testBillingForDate(testDate);
    
    const result = {
      success: true,
      message: `Test billing completed for date: ${testDate}`,
      testDate,
      timestamp: new Date().toISOString(),
      billingDetails: billingResult
    };
    
    // Send result to Slack
    await slackService.sendBatchResult(result);
    
    res.status(200).json(result);
    
  } catch (error) {
    console.error('Error in test billing:', error);
    
    const errorResult = {
      success: false,
      message: 'Test billing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
    
    // Send error result to Slack
    await slackService.sendBatchResult(errorResult);
    
    res.status(500).json(errorResult);
  }
};

// Register HTTP functions
http('processBilling', processBilling);
http('testBilling', testBilling);