import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  console.warn("Environment variable REPLIT_DOMAINS not provided. Using hostname-based fallback for authentication.");
}

const getOidcConfig = memoize(
  async () => {
    if (!process.env.REPL_ID) {
      throw new Error("REPL_ID environment variable is required for authentication");
    }
    
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; 
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
      secure: process.env.NODE_ENV === 'production',  
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

  // Register strategies for configured domains
  const envDomains = process.env.REPLIT_DOMAINS ? 
    process.env.REPLIT_DOMAINS.split(",").filter(d => d.trim()) : 
    [];
  
  for (const domain of envDomains) {
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

  app.get("/api/login", async (req, res, next) => {
    const strategyName = `replitauth:${req.hostname}`;
    
    // Dynamically register strategy for current hostname
    // passport.use() replaces existing strategies with the same name, so this is safe
    const strategy = new Strategy(
      {
        name: strategyName,
        config: await getOidcConfig(),
        scope: "openid email profile offline_access",
        callbackURL: `https://${req.hostname}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
    
    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", async (req, res, next) => {
    const strategyName = `replitauth:${req.hostname}`;
    
    // Dynamically register strategy for current hostname
    // passport.use() replaces existing strategies with the same name, so this is safe
    const strategy = new Strategy(
      {
        name: strategyName,
        config: await getOidcConfig(),
        scope: "openid email profile offline_access",
        callbackURL: `https://${req.hostname}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
    
    passport.authenticate(strategyName, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", async (req, res) => {
    const user = req.user as any;
    
    req.logout(() => {
      // If the user has OIDC tokens (Replit login), redirect to OIDC logout
      if (user?.access_token && user?.expires_at) {
        try {
          const logoutUrl = client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href;
          res.redirect(logoutUrl);
        } catch (error) {
          // If OIDC logout fails, just redirect to home
          res.redirect('/');
        }
      } else {
        // For email/password users, just redirect to home
        res.redirect('/');
      }
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // For email/password users (no expires_at or refresh_token)
  if (!user?.expires_at) {
    // Email/password users are valid as long as they have a session
    if (user?.id || user?.claims?.sub) {
      return next();
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // For OIDC users (with expires_at and refresh_token)
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
