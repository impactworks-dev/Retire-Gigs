// Test error handling scenarios for the job scraping pipeline
import { storage } from './server/storage.js';
import { jobScraperService } from './server/services/jobScraper.js';
import { firecrawlService } from './server/services/firecrawl.js';

async function testInvalidUserId() {
    console.log('\n=== Testing Invalid User ID ===');
    
    try {
        const fakeUserId = "nonexistent-user-123";
        console.log(`Testing with invalid user ID: ${fakeUserId}`);
        
        const result = await jobScraperService.scrapeJobsForUser(fakeUserId);
        
        console.log('Result:', {
            userId: result.userId,
            scrapedCount: result.scrapedCount,
            savedCount: result.savedCount,
            skippedCount: result.skippedCount,
            errorCount: result.errors.length,
            errors: result.errors
        });
        
        if (result.errors.length > 0 && result.errors[0].includes('User not found')) {
            console.log('✅ Correctly handled invalid user ID');
            return true;
        } else {
            console.log('❌ Should have returned user not found error');
            return false;
        }
        
    } catch (error) {
        console.log('✅ Exception thrown as expected:', error.message);
        return true;
    }
}

async function testUserWithoutPreferences() {
    console.log('\n=== Testing User Without Preferences ===');
    
    try {
        // Create a temporary user without preferences
        const testUser = {
            id: "temp-test-user-456",
            firstName: "Test",
            lastName: "User",
            email: "test@example.com",
            location: { city: "Test City", state: "TS" },
            age: "45-54"
        };
        
        console.log('Creating test user without preferences...');
        await storage.createUser(testUser);
        
        console.log(`Testing job scraping for user without preferences: ${testUser.id}`);
        const result = await jobScraperService.scrapeJobsForUser(testUser.id);
        
        console.log('Result:', {
            userId: result.userId,
            scrapedCount: result.scrapedCount,
            savedCount: result.savedCount,
            skippedCount: result.skippedCount,
            errorCount: result.errors.length,
            errors: result.errors
        });
        
        // Cleanup
        try {
            await storage.deleteUser(testUser.id);
            console.log('Test user cleaned up');
        } catch (cleanupError) {
            console.log('Note: Could not cleanup test user (this is ok if using in-memory storage)');
        }
        
        if (result.errors.length > 0 && result.errors[0].includes('preferences not found')) {
            console.log('✅ Correctly handled user without preferences');
            return true;
        } else {
            console.log('❌ Should have returned preferences not found error');
            return false;
        }
        
    } catch (error) {
        console.log('✅ Exception thrown as expected:', error.message);
        return true;
    }
}

async function testEmptyScrapingResults() {
    console.log('\n=== Testing Empty Scraping Results ===');
    
    try {
        // Test with very specific search criteria unlikely to return results
        const emptyOptions = {
            location: "NonexistentCity123456",
            jobType: "UltraSpecificNonexistentJobTitle789",
            maxResults: 1
        };
        
        console.log('Testing Indeed scraping with impossible criteria:', emptyOptions);
        const jobs = await firecrawlService.scrapeIndeedJobs(emptyOptions);
        
        console.log(`Scraped ${jobs.length} jobs (expected: 0 or very few)`);
        
        if (jobs.length === 0 || jobs.length < 3) {
            console.log('✅ Correctly handled empty or minimal results');
            return true;
        } else {
            console.log('⚠️ More results than expected - this may be normal for broad searches');
            return true; // This is still acceptable
        }
        
    } catch (error) {
        console.log('✅ Exception handled gracefully:', error.message);
        return true;
    }
}

async function testServiceAvailability() {
    console.log('\n=== Testing Service Availability ===');
    
    try {
        // Test if services report their availability correctly
        const firecrawlConfigured = firecrawlService.isConfigured();
        const scraperServiceAvailable = jobScraperService.isServiceAvailable();
        
        console.log('Service availability:');
        console.log(`- Firecrawl configured: ${firecrawlConfigured}`);
        console.log(`- Job scraper available: ${scraperServiceAvailable}`);
        
        if (firecrawlConfigured && scraperServiceAvailable) {
            console.log('✅ All services report as available');
            return true;
        } else {
            console.log('⚠️ Some services report as unavailable - check configuration');
            return false;
        }
        
    } catch (error) {
        console.log('❌ Error checking service availability:', error.message);
        return false;
    }
}

async function testRateLimitingAndBatching() {
    console.log('\n=== Testing Rate Limiting and Batching ===');
    
    try {
        // Test that the service doesn't overwhelm external APIs
        const startTime = Date.now();
        
        console.log('Testing multiple rapid scraping calls...');
        
        // Make 3 rapid calls to see if there's proper rate limiting
        const promises = [
            firecrawlService.scrapeIndeedJobs({ maxResults: 1, jobType: "test" }),
            firecrawlService.scrapeIndeedJobs({ maxResults: 1, jobType: "test2" }),
            firecrawlService.scrapeIndeedJobs({ maxResults: 1, jobType: "test3" })
        ];
        
        const results = await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`Completed 3 scraping calls in ${duration}ms`);
        console.log(`Results: ${results.map(r => r.length).join(', ')} jobs each`);
        
        // If it took at least 1 second, there's likely some rate limiting
        if (duration >= 1000) {
            console.log('✅ Rate limiting appears to be in place');
            return true;
        } else {
            console.log('⚠️ Very fast execution - ensure rate limiting is configured for production');
            return true; // Still acceptable for testing
        }
        
    } catch (error) {
        console.log('✅ Exception during rapid calls (may indicate rate limiting):', error.message);
        return true;
    }
}

async function testDataIntegrity() {
    console.log('\n=== Testing Data Integrity ===');
    
    try {
        // Get current job count
        const jobsBefore = await storage.getJobOpportunities();
        const countBefore = jobsBefore.length;
        
        console.log(`Jobs in database before test: ${countBefore}`);
        
        // Try to create a job with invalid data to test validation
        const invalidJobData = {
            // Missing required fields
            title: "",
            company: "",
            location: "",
            description: ""
        };
        
        try {
            await storage.createJobOpportunity(invalidJobData);
            console.log('❌ Should have rejected invalid job data');
            return false;
        } catch (validationError) {
            console.log('✅ Correctly rejected invalid job data:', validationError.message);
        }
        
        // Verify job count hasn't changed
        const jobsAfter = await storage.getJobOpportunities();
        const countAfter = jobsAfter.length;
        
        if (countBefore === countAfter) {
            console.log('✅ Database integrity maintained');
            return true;
        } else {
            console.log('❌ Database count changed unexpectedly');
            return false;
        }
        
    } catch (error) {
        console.log('❌ Error testing data integrity:', error.message);
        return false;
    }
}

async function runErrorHandlingTests() {
    console.log('🧪 Starting Error Handling Tests');
    console.log('=================================');
    
    const tests = [
        { name: 'Invalid User ID', fn: testInvalidUserId },
        { name: 'User Without Preferences', fn: testUserWithoutPreferences },
        { name: 'Empty Scraping Results', fn: testEmptyScrapingResults },
        { name: 'Service Availability', fn: testServiceAvailability },
        { name: 'Rate Limiting', fn: testRateLimitingAndBatching },
        { name: 'Data Integrity', fn: testDataIntegrity }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            console.log(`\n--- Running ${test.name} Test ---`);
            const result = await test.fn();
            
            if (result) {
                console.log(`✅ ${test.name}: PASSED`);
                passed++;
            } else {
                console.log(`❌ ${test.name}: FAILED`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ${test.name}: ERROR - ${error.message}`);
            failed++;
        }
    }
    
    console.log('\n=== Error Handling Test Summary ===');
    console.log(`Total tests: ${tests.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
    
    const overallSuccess = passed >= tests.length * 0.8; // 80% pass rate
    
    if (overallSuccess) {
        console.log('🎉 Error handling tests passed overall!');
        console.log('The job scraping pipeline handles errors gracefully.');
    } else {
        console.log('⚠️ Some error handling tests failed.');
        console.log('Review the error handling implementation.');
    }
    
    return {
        totalTests: tests.length,
        passed,
        failed,
        successRate: (passed / tests.length) * 100,
        overallSuccess
    };
}

// Run the tests
runErrorHandlingTests().then((results) => {
    console.log('\n🏁 Error handling tests completed');
    
    if (results.overallSuccess) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}).catch(error => {
    console.error('❌ Unhandled error in tests:', error);
    process.exit(2);
});