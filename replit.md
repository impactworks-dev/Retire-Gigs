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

### Scheduled Job Scraping Environment Variables

The scheduled job scraping system supports the following environment variables for operational control:

#### Scheduler Configuration
- `JOB_SCHEDULER_ENABLED=true|false` - Enable/disable the job scheduler (default: false for safety)
- `JOB_SCHEDULER_FREQUENCY=daily|weekly|biweekly|monthly` - Default scheduling frequency (default: weekly)
- `MAX_CONCURRENT_SESSIONS=1` - Maximum concurrent scraping sessions (default: 1)
- `SESSION_TIMEOUT_MINUTES=60` - Session timeout in minutes (default: 60)
- `TZ=America/New_York` - Timezone for scheduling (default: America/New_York)

#### Operational Controls
- `SCRAPING_KILL_SWITCH=true|false` - Global emergency kill switch (default: false)
- `MIN_QUALITY_THRESHOLD=40` - Minimum quality threshold percentage (default: 40)
- `MAX_JOBS_PER_SITE=50` - Maximum jobs per site per session (default: 50)

#### Site Controls
- `INDEED_ENABLED=true|false` - Enable Indeed scraping (default: true)
- `AARP_ENABLED=true|false` - Enable AARP scraping (default: true)
- `USAJOBS_ENABLED=true|false` - Enable USAJobs scraping (default: true)

#### Admin Access
The scheduled job scraping system includes comprehensive admin endpoints available at:
- `/api/admin/scheduler/*` - Scheduler control and status
- `/api/admin/operations/*` - Operational controls and health monitoring
- `/api/admin/quality/*` - Quality metrics and recommendations

All admin endpoints require authentication and admin privileges.

## Recent Changes

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

### Scheduled Job Scraping System (September 14, 2025)
- Implemented comprehensive scheduled job scraping with cron functionality
- Added operational guardrails including per-site caps, quality backoff, and feature flags
- Created admin endpoints for scheduler control and operational management
- Built quality monitoring system with metrics tracking and recommendations
- Added emergency controls and kill switches for operational safety
- Integrated with existing job scraping and notification systems

### Database Integration (August 26, 2025)
- Migrated from in-memory storage to PostgreSQL database using Neon
- Added proper Drizzle ORM relations between users, questionnaire responses, and preferences
- Implemented DatabaseStorage class to replace MemStorage
- Successfully pushed schema to database and seeded with sample job opportunities
- Application fully functional with persistent data storage