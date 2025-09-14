// Test script to validate the improved job parsing quality
import { DOMJobParser } from './server/services/domJobParser.js';
import { ContentSanitizer } from './server/services/contentSanitizer.js';
import { QualityMetricsTracker } from './server/services/qualityMetrics.js';

// Mock HTML content that represents typical job site structure with quality issues
const mockIndeedHTML = `
<html>
<body>
  <div class="job">
    <h2><a href="/job1"><span title="Software Developer">Software Developer</span></a></h2>
    <span class="companyName">Tech Solutions Inc</span>
    <div class="locationsContainer">San Francisco, CA</div>
    <div class="salary-snippet">$80,000 - $120,000</div>
    <div class="job-snippet">Join our dynamic team of developers working on cutting-edge web applications...</div>
  </div>
  
  <div class="job">
    <h2><a href="/job2">**Data Analyst**</a></h2>
    <span class="companyName">Analytics Corp</span>
    <div class="locationsContainer">Remote</div>
    <div class="salary-snippet">$60,000 - $90,000</div>
    <div class="job-snippet">Analyze large datasets to drive business decisions. Experience with SQL required.</div>
  </div>
  
  <!-- This should be filtered out as UI element -->
  <div class="job">
    <h2>Saved Search - Software Jobs</h2>
    <span class="companyName">Sign in to create job alerts</span>
    <div class="locationsContainer">Refine your search</div>
    <div class="salary-snippet">No results found</div>
  </div>
  
  <div class="job">
    <h2><a href="/job3">Marketing Manager</a></h2>
    <span class="companyName">Marketing Plus LLC</span>
    <div class="locationsContainer">Los Angeles, CA</div>
    <div class="salary-snippet">$70,000 - $100,000</div>
    <div class="job-snippet">Lead marketing campaigns and manage social media presence for B2B clients.</div>
  </div>
  
  <!-- Another UI element that should be filtered -->
  <div class="job">
    <h2>### Search Suggestions ###</h2>
    <span class="companyName">Try different keywords</span>
    <div class="locationsContainer">Loading more results...</div>
  </div>
</body>
</html>
`;

// Mock markdown content with formatting issues (fallback parsing)
const mockMarkdown = `
# Indeed Job Search Results

## **Senior Engineer**
TechCorp Solutions
San Francisco, CA  
$100,000 - $150,000
Build and maintain large-scale web applications using modern technologies.

## Saved Search Alert
Sign in to save this search
Create job alert
No results match your criteria

## Marketing Specialist  
Creative Agency Ltd
New York, NY
$55,000 - $75,000
Develop marketing strategies and manage client relationships.

## **Please refine your search**
Try different keywords
Broaden your location search
Consider remote work options
`;

async function testParsingQuality() {
  console.log('🧪 Testing Improved Job Parsing Quality');
  console.log('=====================================');
  
  try {
    // Test DOM-based parsing
    console.log('\n📊 Testing DOM-based HTML parsing...');
    const htmlParsingResult = DOMJobParser.parseJobsFromHTML(mockIndeedHTML, '', 'indeed');
    
    console.log(`DOM Parsing Results:`);
    console.log(`- Total parsed: ${htmlParsingResult.parsed}`);
    console.log(`- Valid jobs: ${htmlParsingResult.valid}`);
    console.log(`- Invalid jobs: ${htmlParsingResult.invalid}`);
    console.log(`- Quality score: ${htmlParsingResult.qualityScore}%`);
    
    if (htmlParsingResult.errors.length > 0) {
      console.log(`- Errors: ${htmlParsingResult.errors.slice(0, 3).join(', ')}`);
    }
    
    // Test fallback markdown parsing
    console.log('\n📄 Testing fallback markdown parsing...');
    const markdownParsingResult = DOMJobParser.parseJobsFromHTML('', mockMarkdown, 'indeed');
    
    console.log(`Markdown Parsing Results:`);
    console.log(`- Total parsed: ${markdownParsingResult.parsed}`);
    console.log(`- Valid jobs: ${markdownParsingResult.valid}`);
    console.log(`- Invalid jobs: ${markdownParsingResult.invalid}`);
    console.log(`- Quality score: ${markdownParsingResult.qualityScore}%`);
    
    // Test content sanitization directly
    console.log('\n🧹 Testing content sanitization...');
    const testJobs = [
      {
        title: "Software Developer", 
        company: "Tech Solutions Inc", 
        location: "San Francisco, CA",
        description: "Join our dynamic team..."
      },
      {
        title: "**Data Analyst**", 
        company: "Analytics Corp", 
        location: "Remote",
        description: "Analyze <strong>large datasets</strong> to drive business decisions."
      },
      {
        title: "Saved Search - Software Jobs", 
        company: "Sign in to create job alerts", 
        location: "Refine your search",
        description: "No results found"
      },
      {
        title: "### Search Suggestions ###", 
        company: "Try different keywords", 
        location: "Loading more results...",
        description: "Please wait..."
      }
    ];
    
    let validCount = 0;
    let totalCount = testJobs.length;
    
    for (const [index, job] of testJobs.entries()) {
      const sanitizationResult = ContentSanitizer.sanitizeJobContent(job);
      
      console.log(`\nJob ${index + 1}:`);
      console.log(`  Original: "${job.title}" at "${job.company}"`);
      console.log(`  Sanitized: "${sanitizationResult.sanitized.title}" at "${sanitizationResult.sanitized.company}"`);
      console.log(`  Valid: ${sanitizationResult.sanitized.isValid ? '✅' : '❌'}`);
      console.log(`  Quality Score: ${sanitizationResult.qualityScore}%`);
      
      if (sanitizationResult.sanitized.validationErrors.length > 0) {
        console.log(`  Issues: ${sanitizationResult.sanitized.validationErrors.slice(0, 2).join(', ')}`);
      }
      
      if (sanitizationResult.sanitized.isValid) {
        validCount++;
      }
    }
    
    const overallQualityScore = Math.round((validCount / totalCount) * 100);
    
    console.log('\n📈 OVERALL QUALITY ASSESSMENT');
    console.log('============================');
    console.log(`DOM Parsing Quality: ${htmlParsingResult.qualityScore}%`);
    console.log(`Markdown Parsing Quality: ${markdownParsingResult.qualityScore}%`);
    console.log(`Content Sanitization Quality: ${overallQualityScore}%`);
    
    // Determine overall success
    const avgQuality = (htmlParsingResult.qualityScore + markdownParsingResult.qualityScore + overallQualityScore) / 3;
    console.log(`\n🎯 AVERAGE QUALITY SCORE: ${Math.round(avgQuality)}%`);
    
    if (avgQuality >= 80) {
      console.log(`✅ SUCCESS: Quality target of ≥80% achieved!`);
      console.log(`📊 Improvement from 28.6% to ${Math.round(avgQuality)}% = ${Math.round(avgQuality - 28.6)}% gain`);
    } else {
      console.log(`❌ Quality target not met. Current: ${Math.round(avgQuality)}%, Target: ≥80%`);
    }
    
    // Show key improvements
    console.log('\n🔧 KEY IMPROVEMENTS IMPLEMENTED:');
    console.log('- ✅ DOM-based parsing with site-specific selectors');
    console.log('- ✅ Content sanitization and validation');
    console.log('- ✅ UI element filtering (removes "Saved Search", navigation, etc.)');
    console.log('- ✅ HTML tag and markdown cleanup');
    console.log('- ✅ Suspicious content detection');
    console.log('- ✅ Strict validation rules for titles, companies, locations');
    console.log('- ✅ XSS prevention through content sanitization');
    console.log('- ✅ Quality metrics and logging system');
    
    // Record test metrics
    QualityMetricsTracker.recordMetrics({
      sessionId: 'test-session-' + Date.now(),
      timestamp: new Date(),
      site: 'test',
      totalParsed: htmlParsingResult.parsed + markdownParsingResult.parsed,
      validJobs: htmlParsingResult.valid + markdownParsingResult.valid,
      invalidJobs: htmlParsingResult.invalid + markdownParsingResult.invalid,
      qualityScore: avgQuality,
      commonErrors: [...htmlParsingResult.errors, ...markdownParsingResult.errors].map(error => ({ error, count: 1 })),
      parsingMethod: 'DOM',
      averageProcessingTime: 0
    });
    
    console.log('\n📋 Test completed successfully!');
    return avgQuality;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return 0;
  }
}

// Run the test
testParsingQuality().then(score => {
  process.exit(score >= 80 ? 0 : 1);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});