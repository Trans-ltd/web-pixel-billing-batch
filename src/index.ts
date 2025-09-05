import { http, HttpFunction } from '@google-cloud/functions-framework';
import { BillingService } from './services/billing';

const billingService = new BillingService();

export const processBilling: HttpFunction = async (req, res) => {
  console.log('Billing batch process started');
  
  try {
    // Check if this is a scheduled trigger from Cloud Scheduler
    const isScheduledTrigger = req.headers['x-cloudscheduler-job'] || 
                              req.headers['user-agent']?.includes('Google-Cloud-Scheduler');
    
    // Process daily billing
    await billingService.processDailyBilling();
    
    res.status(200).json({
      success: true,
      message: 'Billing process completed successfully',
      timestamp: new Date().toISOString(),
      scheduled: !!isScheduledTrigger
    });
    
  } catch (error) {
    console.error('Error processing billing:', error);
    
    res.status(500).json({
      success: false,
      message: 'Billing process failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const testBilling: HttpFunction = async (req, res) => {
  console.log('Test billing process started');
  
  try {
    const { date } = req.query;
    const testDate = typeof date === 'string' ? date : new Date().toISOString().split('T')[0];
    
    await billingService.testBillingForDate(testDate);
    
    res.status(200).json({
      success: true,
      message: `Test billing completed for date: ${testDate}`,
      testDate,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in test billing:', error);
    
    res.status(500).json({
      success: false,
      message: 'Test billing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

// Default handler for the main billing process
http('processBilling', processBilling);
http('testBilling', testBilling);

// For local development and testing
if (require.main === module) {
  console.log('Starting local development server...');
  
  // You can test the billing service locally here
  const testMode = process.env.NODE_ENV === 'test';
  
  if (testMode) {
    billingService.testBillingForDate('2024-01-01')
      .then(() => console.log('Local test completed'))
      .catch(error => console.error('Local test failed:', error));
  }
}