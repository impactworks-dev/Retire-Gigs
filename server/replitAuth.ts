import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { randomUUID } from "crypto";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

// Temporary storage for cross-domain authentication tokens
const authTokens = new Map<string, { 
  originalDomain: string, 
  userClaims: any, 
  expires: number 
}>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(authTokens.entries());
  for (const [token, data] of entries) {
    if (now > data.expires) {
      authTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    age: "55+", // Default for platform users
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Get domains from environment and add the actual current domain
  const envDomains = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(",") : [];
  // Extract the current domain by replacing .replit.dev with .repl.co if needed
  const currentDomain = envDomains.length > 0 ? 
    envDomains[0].replace('.replit.dev', '.repl.co') : 
    '48f9b286-e008-48ab-8187-58819bef2085-00-1zo3nkwdvuaba.janeway.repl.co';
  
  // Combine and deduplicate domains
  const domainsSet = new Set([...envDomains, currentDomain]);
  const allDomains = Array.from(domainsSet);
  
  for (const domain of allDomains) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
    
    console.log(`Registered auth strategy for domain: ${domain}`);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    // Find the canonical .replit.dev domain from REPLIT_DOMAINS
    const envDomains = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(",") : [];
    const canonicalDomain = envDomains.find(domain => domain.includes('.replit.dev')) || envDomains[0];
    
    // Get all allowed domains for validation
    const currentDomain = envDomains.length > 0 ? 
      envDomains[0].replace('.replit.dev', '.repl.co') : 
      '48f9b286-e008-48ab-8187-58819bef2085-00-1zo3nkwdvuaba.janeway.repl.co';
    const allowedDomains = new Set([...envDomains, currentDomain]);
    
    // If user is on .repl.co domain, validate and pass original domain for cross-domain auth
    if (req.hostname.includes('.repl.co') && canonicalDomain) {
      // Security: Only allow redirect to verified domains
      if (!allowedDomains.has(req.hostname)) {
        return res.status(400).send('Invalid domain');
      }
      
      const originalDomain = encodeURIComponent(req.hostname);
      return res.redirect(`https://${canonicalDomain}/api/login?return_domain=${originalDomain}`);
    }
    
    // Validate return_domain parameter if present (security check)
    if (req.query.return_domain) {
      const returnDomain = decodeURIComponent(req.query.return_domain as string);
      if (!allowedDomains.has(returnDomain)) {
        return res.status(400).send('Invalid return domain');
      }
    }
    
    // Use canonical domain for authentication or current domain if it's already canonical
    const authDomain = canonicalDomain || req.hostname;
    passport.authenticate(`replitauth:${authDomain}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
      state: req.query.return_domain ? `return_domain=${req.query.return_domain}` : undefined,
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    // Use canonical domain for callback authentication
    const envDomains = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(",") : [];
    const canonicalDomain = envDomains.find(domain => domain.includes('.replit.dev')) || envDomains[0];
    const authDomain = canonicalDomain || req.hostname;
    
    passport.authenticate(`replitauth:${authDomain}`, {
      failureRedirect: "/api/login",
    })(req, res, (err: any) => {
      if (err) {
        return res.redirect("/api/login");
      }
      
      // Extract return domain from state parameter
      const state = req.query.state as string;
      let originalDomain: string | undefined;
      
      if (state && state.startsWith('return_domain=')) {
        originalDomain = decodeURIComponent(state.split('return_domain=')[1]);
      }
      
      if (originalDomain && originalDomain !== req.hostname) {
        // Security: Validate that originalDomain is in allowed domains
        const envDomains = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(",") : [];
        const currentDomain = envDomains.length > 0 ? 
          envDomains[0].replace('.replit.dev', '.repl.co') : 
          '48f9b286-e008-48ab-8187-58819bef2085-00-1zo3nkwdvuaba.janeway.repl.co';
        const allowedDomains = new Set([...envDomains, currentDomain]);
        
        if (!allowedDomains.has(originalDomain)) {
          return res.redirect("/api/login");
        }
        
        // Create a secure token for cross-domain authentication
        const token = randomUUID();
        const userClaims = (req.user as any)?.claims;
        
        authTokens.set(token, {
          originalDomain,
          userClaims,
          expires: Date.now() + 5 * 60 * 1000 // 5 minutes
        });
        
        // Redirect to original domain with the token
        return res.redirect(`https://${originalDomain}/api/auth/complete?token=${token}`);
      }
      
      // Same domain, normal redirect
      res.redirect("/");
    });
  });

  // Cross-domain authentication completion endpoint
  app.get("/api/auth/complete", async (req, res) => {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.redirect("/api/login");
    }
    
    const authData = authTokens.get(token);
    if (!authData || Date.now() > authData.expires) {
      authTokens.delete(token);
      return res.redirect("/api/login");
    }
    
    // Security: Verify that current hostname matches the token's intended domain
    if (authData.originalDomain !== req.hostname) {
      authTokens.delete(token);
      return res.redirect("/api/login");
    }
    
    // Delete the token (single use)
    authTokens.delete(token);
    
    try {
      // Establish session on this domain
      const userClaims = authData.userClaims;
      await upsertUser(userClaims);
      
      req.login({
        claims: userClaims,
        access_token: 'cross_domain_token',
        expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      }, (err) => {
        if (err) {
          console.error('Failed to establish cross-domain session:', err);
          return res.redirect("/api/login");
        }
        res.redirect("/");
      });
    } catch (error) {
      console.error('Error in cross-domain auth completion:', error);
      res.redirect("/api/login");
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Admin authorization middleware
export const isAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!req.isAuthenticated() || !user.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = user.claims.sub;
  
  // Get admin user IDs from environment variable or use default fallback
  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
  
  // Check if user is in admin list
  if (!adminIds.includes(userId)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
};