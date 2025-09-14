// Script to validate job data quality and check for parsing issues
import { storage } from './server/storage.js';

async function validateJobQuality() {
    console.log('🔍 Validating Job Data Quality');
    console.log('===============================');
    
    try {
        // Get all job opportunities
        const allJobs = await storage.getJobOpportunities();
        console.log(`Total jobs in database: ${allJobs.length}`);
        
        // Get the most recent jobs (likely from our test)
        const recentJobs = allJobs.slice(-20); // Last 20 jobs
        
        console.log('\n=== Recent Jobs Analysis ===');
        
        let validJobs = 0;
        let suspiciousJobs = 0;
        let issuesFound = [];
        
        // Keywords that indicate non-job content
        const suspiciousKeywords = [
            'saved search', 'search for', 'refine your search', 'please refine',
            'resumes limited', 'search features', 'sign in', 'create alert',
            'no results', 'try different', 'suggestions', 'sponsored',
            'advertisement', 'cookies', 'privacy', 'terms of'
        ];
        
        recentJobs.forEach((job, index) => {
            const titleLower = job.title.toLowerCase();
            const companyLower = job.company.toLowerCase();
            
            // Check for suspicious content
            const isSuspicious = suspiciousKeywords.some(keyword => 
                titleLower.includes(keyword) || companyLower.includes(keyword)
            );
            
            // Check for other quality issues
            const hasMarkdown = job.title.includes('[') || job.title.includes('##');
            const hasURL = job.title.includes('http') || job.title.includes('www.');
            const tooShort = job.title.length < 3;
            const tooLong = job.title.length > 200;
            const noCompany = !job.company || job.company.trim().length === 0;
            
            if (isSuspicious || hasMarkdown || hasURL || tooShort || tooLong || noCompany) {
                suspiciousJobs++;
                issuesFound.push({
                    title: job.title.substring(0, 100) + (job.title.length > 100 ? '...' : ''),
                    company: job.company,
                    issues: [
                        isSuspicious && 'Contains suspicious keywords',
                        hasMarkdown && 'Contains markdown formatting',
                        hasURL && 'Contains URLs',
                        tooShort && 'Title too short',
                        tooLong && 'Title too long',
                        noCompany && 'Missing company'
                    ].filter(Boolean)
                });
            } else {
                validJobs++;
            }
            
            // Print first few jobs for manual inspection
            if (index < 5) {
                console.log(`\nJob ${index + 1}:`);
                console.log(`  Title: ${job.title.substring(0, 80)}${job.title.length > 80 ? '...' : ''}`);
                console.log(`  Company: ${job.company}`);
                console.log(`  Location: ${job.location || 'N/A'}`);
                console.log(`  Pay: ${job.pay || 'N/A'}`);
                console.log(`  Valid: ${!(isSuspicious || hasMarkdown || hasURL || tooShort || tooLong || noCompany) ? '✅' : '❌'}`);
            }
        });
        
        console.log('\n=== Quality Assessment ===');
        console.log(`Valid jobs: ${validJobs} (${((validJobs/recentJobs.length)*100).toFixed(1)}%)`);
        console.log(`Suspicious jobs: ${suspiciousJobs} (${((suspiciousJobs/recentJobs.length)*100).toFixed(1)}%)`);
        
        if (issuesFound.length > 0) {
            console.log('\n=== Issues Found ===');
            issuesFound.slice(0, 10).forEach((issue, index) => {
                console.log(`${index + 1}. "${issue.title}"`);
                console.log(`   Company: ${issue.company}`);
                console.log(`   Issues: ${issue.issues.join(', ')}`);
                console.log('');
            });
            
            if (issuesFound.length > 10) {
                console.log(`... and ${issuesFound.length - 10} more issues`);
            }
        }
        
        // Check for duplicate detection
        console.log('\n=== Duplicate Detection ===');
        const titles = allJobs.map(job => job.title.toLowerCase().trim());
        const duplicateTitles = titles.filter((title, index) => titles.indexOf(title) !== index);
        const uniqueDuplicates = [...new Set(duplicateTitles)];
        
        console.log(`Total duplicate titles found: ${uniqueDuplicates.length}`);
        if (uniqueDuplicates.length > 0) {
            console.log('Sample duplicates:');
            uniqueDuplicates.slice(0, 5).forEach((title, index) => {
                const count = titles.filter(t => t === title).length;
                console.log(`  ${index + 1}. "${title}" (${count} copies)`);
            });
        }
        
        // Overall quality score
        const qualityScore = (validJobs / recentJobs.length) * 100;
        console.log('\n=== Overall Assessment ===');
        
        if (qualityScore >= 80) {
            console.log(`🟢 GOOD: ${qualityScore.toFixed(1)}% of recent jobs are valid`);
        } else if (qualityScore >= 60) {
            console.log(`🟡 MODERATE: ${qualityScore.toFixed(1)}% of recent jobs are valid - needs improvement`);
        } else {
            console.log(`🔴 POOR: ${qualityScore.toFixed(1)}% of recent jobs are valid - significant parsing issues`);
        }
        
        // Recommendations
        console.log('\n=== Recommendations ===');
        if (suspiciousJobs > recentJobs.length * 0.2) {
            console.log('- Improve content filtering to exclude UI elements and search prompts');
            console.log('- Add better job title validation patterns');
        }
        if (issuesFound.some(issue => issue.issues.includes('Contains markdown formatting'))) {
            console.log('- Clean markdown formatting from scraped content');
        }
        if (uniqueDuplicates.length > 0) {
            console.log('- Strengthen deduplication logic');
        }
        if (qualityScore < 80) {
            console.log('- Review and improve parsing patterns for job sites');
            console.log('- Add more robust content validation');
        }
        
        return {
            totalJobs: allJobs.length,
            recentJobs: recentJobs.length,
            validJobs,
            suspiciousJobs,
            qualityScore,
            duplicatesFound: uniqueDuplicates.length,
            issuesFound: issuesFound.length
        };
        
    } catch (error) {
        console.error('❌ Error validating job quality:', error);
        return null;
    }
}

// Run the validation
validateJobQuality().then((results) => {
    if (results) {
        console.log('\n🏁 Validation completed successfully');
        
        // Return status code based on quality
        if (results.qualityScore >= 80) {
            process.exit(0); // Success
        } else if (results.qualityScore >= 60) {
            process.exit(1); // Partial success
        } else {
            process.exit(2); // Needs significant improvement
        }
    } else {
        console.log('\n❌ Validation failed');
        process.exit(3);
    }
}).catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(4);
});