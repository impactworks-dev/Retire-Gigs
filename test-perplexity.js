import { perplexityService } from './server/services/perplexityService.js';
import { jobParserService } from './server/services/jobParserService.js';

async function testPerplexityIntegration() {
  console.log('🧪 Testing Perplexity Integration...\n');

  try {
    // Check if service is available
    if (!perplexityService.isServiceAvailable()) {
      console.error('❌ Perplexity service not available - API key not configured');
      return;
    }
    console.log('✅ Perplexity service is available');

    // Test connection
    console.log('🔌 Testing connection...');
    const connectionTest = await perplexityService.testConnection();
    if (connectionTest.success) {
      console.log('✅ Connection successful:', connectionTest.message);
    } else {
      console.error('❌ Connection failed:', connectionTest.message);
      return;
    }

    // Test job search
    console.log('\n🔍 Testing job search...');
    const testQuery = {
      location: 'Remote',
      jobTypes: ['part-time', 'customer service'],
      schedule: 'flexible',
      experienceLevel: 'senior-friendly, experienced workers welcome',
      keywords: ['customer service', 'support', 'remote'],
      excludeKeywords: ['entry-level', 'recent graduate']
    };

    console.log('Query:', JSON.stringify(testQuery, null, 2));
    
    const searchResponse = await perplexityService.searchJobs(testQuery);
    console.log(`\n📄 Raw response (${searchResponse.length} characters):`);
    console.log(searchResponse.substring(0, 500) + '...\n');

    // Test job parsing
    console.log('🔧 Testing job parsing...');
    const parsedJobs = jobParserService.parseJobsFromText(searchResponse);
    
    console.log(`✅ Parsed ${parsedJobs.length} jobs:`);
    parsedJobs.forEach((job, index) => {
      console.log(`\n${index + 1}. ${job.title} at ${job.company}`);
      console.log(`   Location: ${job.location}`);
      console.log(`   Pay: ${job.pay}`);
      console.log(`   Schedule: ${job.schedule}`);
      console.log(`   Tags: ${JSON.stringify(job.tags)}`);
      console.log(`   Match Score: ${job.matchScore}`);
      console.log(`   Description: ${job.description.substring(0, 100)}...`);
    });

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testPerplexityIntegration();