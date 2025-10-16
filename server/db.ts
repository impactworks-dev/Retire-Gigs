import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enhanced pool configuration with connection management
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Connection timeout
  // SSL handled via DATABASE_URL connection string parameter (sslmode=disable)
};

let pool: Pool;
let db: ReturnType<typeof drizzle>;
let initializationInProgress = false;

// Initialize database connection with error handling
function initializeDatabase() {
  // Prevent concurrent initialization
  if (initializationInProgress) {
    console.log('Database initialization already in progress, skipping...');
    return;
  }
  
  initializationInProgress = true;
  
  try {
    // Close existing pool if it exists
    if (pool) {
      console.log('Closing existing database pool...');
      pool.end().catch(err => console.error('Error closing existing pool:', err));
    }
    
    pool = new Pool(poolConfig);
    
    // Add error handling for pool events
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
      console.error('Client info:', client);
      
      // Attempt to recreate the pool on critical errors
      if (err.message.includes('terminating connection') || 
          err.message.includes('connection terminated') ||
          err.message.includes('administrator command')) {
        console.log('Database connection terminated, attempting to reconnect...');
        setTimeout(() => {
          try {
            initializeDatabase();
            console.log('Database reconnection successful');
          } catch (reconnectError) {
            console.error('Failed to reconnect to database:', reconnectError);
          }
        }, 5000); // Wait 5 seconds before attempting reconnection
      }
    });
    
    pool.on('connect', (client) => {
      console.log('New database client connected');
    });
    
    pool.on('remove', (client) => {
      console.log('Database client removed from pool');
    });
    
    db = drizzle({ client: pool, schema });
    console.log('Database connection initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database connection:', error);
    throw error;
  } finally {
    initializationInProgress = false;
  }
}

// Enhanced database query wrapper with retry logic
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>, 
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Check if it's a connection-related error that should trigger retry
      const isConnectionError = error.message?.includes('connection') ||
                               error.message?.includes('terminated') ||
                               error.code === 'ECONNRESET' ||
                               error.code === '57P01'; // PostgreSQL termination error code
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`Retrying database operation in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Try to reinitialize the database connection
        try {
          initializeDatabase();
        } catch (reinitError) {
          console.error('Failed to reinitialize database during retry:', reinitError);
        }
      } else if (attempt === maxRetries) {
        break;
      }
    }
  }
  
  throw new Error(`Database operation failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Initialize the database connection
initializeDatabase();

// Export the database connection
export { pool, db };
