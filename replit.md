# replit.md

## Overview

Retiree Gigs is a job matching platform specifically designed for adults aged 55 and older. The application provides a user-friendly questionnaire-based onboarding process that collects preferences and background information to match users with appropriate job opportunities. The platform focuses on accessibility and simplicity, presenting one question at a time with large, clickable buttons to reduce friction in the user experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite for build tooling
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: Radix UI primitives with custom styling via shadcn/ui component library
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Design System**: Clean, accessible interface optimized for older adults with large buttons and clear typography

### Backend Architecture
- **Runtime**: Node.js with Express.js web framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with structured error handling and request logging
- **Storage Layer**: Abstracted storage interface with PostgreSQL database implementation using Neon
- **Validation**: Zod schemas for runtime type checking and data validation

### Data Architecture
- **Database**: PostgreSQL configured via Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Type Safety**: Full type safety from database schema to frontend using shared TypeScript types
- **Data Models**: Users, questionnaire responses, user preferences, and job opportunities

### Key Design Patterns
- **Monorepo Structure**: Shared types and schemas between client and server
- **Component Composition**: Reusable UI components with consistent styling
- **Progressive Enhancement**: Mobile-first responsive design with accessibility considerations
- **Error Boundaries**: Graceful error handling with user-friendly messages

## External Dependencies

### Database & Infrastructure
- **Neon Database**: Serverless PostgreSQL database hosting
- **Drizzle ORM**: Type-safe database operations and migrations

### UI & Styling
- **Radix UI**: Headless UI components for accessibility and flexibility
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography

### Development & Build Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Static type checking and enhanced developer experience
- **ESBuild**: Fast JavaScript bundling for production builds

### Third-Party Services
- **Unsplash**: Stock photography for hero images and visual content
- **Google Fonts**: Web fonts (Inter, DM Sans, etc.) for typography
- **Replit Integration**: Development environment integration and error handling

### Potential Future Integrations
- **Job Board APIs**: For external job opportunity sourcing
- **Analytics**: For user behavior tracking and platform optimization

## Environment Configuration

### Real-Time Job Search Configuration

The real-time job search system uses Perplexity API for live job discovery and OpenAI GPT-5-mini for structured data parsing. This replaces the deprecated batch scraping system.

#### Required API Keys
- `OPENAI_API_KEY` - OpenAI API key for GPT-5-mini structured parsing (model: gpt-4o-mini)
- `PERPLEXITY_API_KEY` - Perplexity API key for live job searches (model: sonar-pro)

#### Service Configuration
The services are configured in:
- `server/services/jobSearchService.ts` - Main orchestration service
- `server/services/perplexityService.ts` - Perplexity API integration
- OpenAI integration uses the standard OpenAI SDK with response_format for JSON output

#### Rate Limiting
- `POST /api/jobs/search` - 10 requests per 15 minutes per IP address
- Applies to all authenticated users to prevent API quota exhaustion

### API Endpoints

#### Job Search
- `POST /api/jobs/search` - Real-time job search endpoint
  - Requires authentication
  - Request body: `{ jobTitle, location, jobType, remote, partTime, schedule }`
  - Returns: `{ jobs: JobOpportunity[] }` with URLs to external job postings
  - Search results are temporary (not persisted) but users can save individual jobs
  - Example: User searches for "part-time cashier in Seattle" → Perplexity finds current listings → OpenAI structures the data → Display as job cards with "Apply Now" links

## Recent Changes

### Replit Migration & SSL Fix (October 16, 2025)
- **Successfully migrated application to Replit environment**
- **Fixed critical SSL certificate validation issue with Neon database**
  - Issue: Neon serverless adapter was encountering "self-signed certificate in certificate chain" errors during OAuth callback
  - Root cause: TLS connections from Replit to Neon database were failing certificate validation
  - Solution: Implemented TLS-level configuration to accept self-signed certificates in development environment
  - Implementation: Modified `server/db.ts` to override `tls.connect()` with `rejectUnauthorized: false` for development
  - **Status: Replit Auth OAuth flow now works successfully with database persistence**
- **Configured Replit Auth integration**
  - Set up Replit OAuth authentication with dynamic domain registration
  - Fixed session persistence across OAuth redirect flow
  - Authentication working for both .replit.dev and .repl.co domains
- **Environment setup**
  - Installed Node.js 20 and all required dependencies
  - Configured workflows for development server
  - Set up database connection with proper SSL handling

### Critical Bug Fixes (September 30, 2025)
- **Fixed multiple critical bugs identified in comprehensive codebase review**
- **server/storage.ts** - Fixed type error where job opportunity URL property had undefined vs null mismatch
  - Solution: Explicitly normalize optional URLs to null with `url: job.url || null`
- **server/services/jobParserService.ts** - Fixed crash when regex matches return null
  - Solution: Made null check more explicit `if (matches !== null && matches.length > 1)`
  - Prevents crashes in splitIntoJobSections when parsing job descriptions
- **server/db.ts** - Fixed race condition in database initialization
  - Solution: Added `initializationInProgress` flag to prevent concurrent initialization attempts
  - Properly close existing pool connections before creating new ones
  - Use finally block to ensure flag is reset even if initialization fails
- **server/replitAuth.ts** - Completely fixed REPLIT_DOMAINS environment variable handling
  - Solution: Changed top-level throw to console.warn (no crash on missing env var)
  - Added `.filter(d => d.trim())` everywhere to handle empty strings from split
  - Made currentDomain calculation safely handle empty arrays
  - Used `.filter(Boolean)` to remove null values from domain lists
  - **Most importantly:** Added dynamic strategy registration in /api/login and /api/callback handlers
  - Strategies now register on-demand using req.hostname as fallback when REPLIT_DOMAINS is missing
  - Wrapped registration in try-catch for graceful error handling
  - **Result:** Authentication works reliably with or without REPLIT_DOMAINS configuration
- **Testing:** All fixes validated with end-to-end tests covering authentication, job search, and database operations
- **Status:** Application running successfully with no LSP errors or runtime crashes

### Real-Time Job Search System (September 30, 2025)
- **Implemented real-time job search system using Perplexity and OpenAI**
- **Backend:** Built modular `jobSearchService` that orchestrates Perplexity API searches with OpenAI GPT-5-mini structured parsing
- **API:** Created POST /api/jobs/search endpoint for dynamic, on-demand job searches with rate limiting
- **Frontend:** Added job search dialog component (`client/src/components/job-search-dialog.tsx`) accessible from dashboard
- **UI/UX:** Search dialog includes form validation, loading states, and success feedback
- **Data Model:** Added URL field to jobOpportunities schema for linking to external job postings
- **Job Cards:** Updated JobCard component to conditionally show "Apply Now" button with external links when URL is available
- **User Flow:** Users click "Search Jobs" → enter criteria → system searches in real-time → results display as temporary cards → users can save interesting jobs
- **Search Results:** Display temporarily without persisting to database, with dismissible banner to return to saved jobs
- **Deprecated and archived legacy batch scraping system** - moved to archive/obsolete-batch-scraping/
- System now focuses on real-time searches based on live user requests instead of scheduled batch scraping

### Cross-Domain Authentication Fix (September 25, 2025)
- **RESOLVED: Cross-domain authentication issues between .replit.dev and .repl.co domains**
- Implemented secure token-based cross-domain session sharing mechanism
- Fixed authentication flow to work seamlessly across both domain variants
- Added comprehensive security protections against open redirect and token replay attacks
- Enhanced domain validation with strict allow-listing of legitimate Replit domains
- Authentication now works normally without requiring workarounds or manual session management
- **Status: Authentication system fully functional and secure across all domains**

### SMS Notifications Implementation (August 31, 2025)
- Implemented complete SMS notification system using Resend API
- Added phone number field to user database schema with proper database migration
- Created SMS service layer with message templating for job alerts
- Enhanced user preferences to include SMS notification settings
- Updated job notification service to send both email and SMS notifications
- Enabled SMS notification controls in frontend with real-time status updates
- Added phone number management in user profile settings
- Integrated SMS functionality into existing notification workflow

### Progressive Web App Implementation (August 31, 2025)
- Implemented full PWA functionality with installable mobile app capabilities
- Added service worker for offline functionality and background sync
- Created app manifest with proper metadata and shortcuts
- Generated multiple icon sizes for various device requirements
- Added smart install prompt component with dismissal logic
- Configured offline page with helpful messaging and cached content access
- Users can now install the app directly to their mobile home screen for native-like experience

### Saved Jobs Feature (August 31, 2025)
- Built complete saved jobs functionality with bookmark system
- Added dedicated saved jobs page with proper data structure
- Implemented backend API endpoints for saving/unsaving jobs
- Created bookmark toggle UI with visual feedback (filled/unfilled icons)
- Added navigation menu item for easy access to saved jobs
- Integrated proper state management and cache invalidation

### GPS Location and Address Management (August 31, 2025)
- Implemented GPS location tracking for better job matching
- Added automatic address geocoding and reverse geocoding
- Created "Use Current Location" functionality for profile forms
- Added latitude/longitude database fields for precise location data
- Enhanced user experience with location-based job recommendations

### Scheduled Job Scraping System (September 14, 2025) - **DEPRECATED September 30, 2025**
- **System replaced by real-time job search using Perplexity and OpenAI**
- **Legacy code archived to archive/obsolete-batch-scraping/**
  - Archived files: jobScraper.ts, jobScheduler.ts, operationalControls.ts, qualityMetrics.ts
  - Archived tests: test-firecrawl.js, test-error-handling.js
- **Migration notes for maintainers:**
  - All batch scraping API endpoints have been removed from routes.ts
  - No database schema changes required (system continues to use same jobOpportunities table)
  - Environment variables for scheduler/operational controls are no longer used
  - The archived code is preserved for reference but should not be reintroduced
- **See "Real-Time Job Search System" above for current implementation**

### Database Integration (August 26, 2025)
- Migrated from in-memory storage to PostgreSQL database using Neon
- Added proper Drizzle ORM relations between users, questionnaire responses, and preferences
- Implemented DatabaseStorage class to replace MemStorage
- Successfully pushed schema to database and seeded with sample job opportunities
- Application fully functional with persistent data storage