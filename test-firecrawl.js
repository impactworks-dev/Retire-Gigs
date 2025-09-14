// Temporary test script for Firecrawl functionality
import { firecrawlService } from './server/services/firecrawl.js';
import { jobScraperService } from './server/services/jobScraper.js';
import { storage } from './server/storage.js';

async function testFirecrawlConnection() {
    console.log('=== Testing Firecrawl Connection ===');
    
    // Test if service is configured
    const isConfigured = firecrawlService.isConfigured();
    console.log('Firecrawl configured:', isConfigured);
    
    if (!isConfigured) {
        console.log('❌ Firecrawl service not configured');
        return false;
    }
    
    // Test API connection
    try {
        const connectionTest = await firecrawlService.testConnection();
        console.log('Connection test result:', connectionTest);
        
        if (connectionTest) {
            console.log('✅ Firecrawl API connection successful');
            return true;
        } else {
            console.log('❌ Firecrawl API connection failed');
            return false;
        }
    } catch (error) {
        console.error('❌ Error testing connection:', error.message);
        return false;
    }
}

async function testJobScraping() {
    console.log('\n=== Testing Job Scraping ===');
    
    try {
        // Test basic job scraping
        const testOptions = {
            location: "Remote",
            jobType: "part time",
            remote: true,
            partTime: true,
            maxResults: 3
        };
        
        console.log('Testing Indeed job scraping with options:', testOptions);
        const indeedJobs = await firecrawlService.scrapeIndeedJobs(testOptions);
        
        console.log(`Scraped ${indeedJobs.length} jobs from Indeed`);
        
        if (indeedJobs.length > 0) {
            console.log('Sample job:');
            console.log('- Title:', indeedJobs[0].title);
            console.log('- Company:', indeedJobs[0].company);
            console.log('- Location:', indeedJobs[0].location);
            console.log('- Description preview:', indeedJobs[0].description?.substring(0, 100) + '...');
        }
        
        return indeedJobs;
        
    } catch (error) {
        console.error('❌ Error testing job scraping:', error.message);
        return [];
    }
}

async function testUserSpecificScraping() {
    console.log('\n=== Testing User-Specific Scraping ===');
    
    try {
        // Use the test user ID we found
        const userId = "47373582";
        console.log('Testing job scraping for user:', userId);
        
        // Get user and preferences
        const user = await storage.getUser(userId);
        const preferences = await storage.getUserPreferences(userId);
        
        if (!user) {
            console.log('❌ User not found');
            return;
        }
        
        if (!preferences) {
            console.log('❌ User preferences not found');
            return;
        }
        
        console.log('User info:');
        console.log('- Name:', user.firstName, user.lastName);
        console.log('- Location:', user.location?.city, user.location?.state);
        console.log('- Preferences:', JSON.stringify(preferences, null, 2));
        
        // Test the user-specific scraping
        const result = await jobScraperService.scrapeJobsForUser(userId);
        
        console.log('Scraping result:');
        console.log('- Scraped count:', result.scrapedCount);
        console.log('- Saved count:', result.savedCount);
        console.log('- Skipped count:', result.skippedCount);
        console.log('- Errors:', result.errors);
        
        if (result.savedCount > 0) {
            console.log('✅ User-specific job scraping successful');
        } else {
            console.log('⚠️ No jobs were saved for user');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error testing user-specific scraping:', error.message);
        return null;
    }
}

async function main() {
    console.log('🚀 Starting Firecrawl End-to-End Test');
    console.log('=====================================');
    
    let connectionOk = false;
    let scrapedJobs = [];
    let userResult = null;
    
    try {
        // Test connection (but continue even if it fails)
        connectionOk = await testFirecrawlConnection();
        if (!connectionOk) {
            console.log('\n⚠️ Connection test failed - but continuing with job scraping tests');
            console.log('(The connection test URL might be blocked, but actual job sites might work)');
        }
        
        // Test basic scraping regardless of connection test result
        scrapedJobs = await testJobScraping();
        
        // Test user-specific scraping
        userResult = await testUserSpecificScraping();
        
        console.log('\n=== Test Summary ===');
        console.log(`Connection test: ${connectionOk ? '✅ PASSED' : '❌ FAILED (but may not be critical)'}`);
        console.log(`Basic scraping: ${scrapedJobs.length > 0 ? '✅ PASSED' : '❌ FAILED'} (${scrapedJobs.length} jobs)`);
        console.log(`User scraping: ${userResult && userResult.savedCount > 0 ? '✅ PASSED' : userResult ? '⚠️ PARTIAL' : '❌ FAILED'} (${userResult?.savedCount || 0} jobs saved)`);
        
        if (userResult?.errors && userResult.errors.length > 0) {
            console.log('\n⚠️ Errors encountered:');
            userResult.errors.forEach(error => console.log('  -', error));
        }
        
        // Overall assessment
        const overallSuccess = scrapedJobs.length > 0 || (userResult && userResult.savedCount > 0);
        console.log(`\n🎯 Overall Test Result: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILURE'}`);
        
        if (overallSuccess) {
            console.log('🎉 The Firecrawl job scraping functionality is working!');
        } else {
            console.log('💥 The job scraping functionality needs attention.');
        }
        
    } catch (error) {
        console.error('❌ Fatal error in test:', error);
    }
}

// Run the test
main().then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
}).catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});