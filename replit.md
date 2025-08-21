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
- **Storage Layer**: Abstracted storage interface with in-memory implementation for development
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
- **Email Service**: For job notifications and communication
- **SMS Service**: For mobile notifications
- **Job Board APIs**: For external job opportunity sourcing
- **Analytics**: For user behavior tracking and platform optimization