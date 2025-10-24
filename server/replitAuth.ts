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
  console.warn(
    "Environment variable REPLIT_DOMAINS not provided. Using hostname-based fallback for authentication.",
  );
}

// Temporary storage for cross-domain authentication tokens
const authTokens = new Map<
  string,
  {
    originalDomain: string;
    userClaims: any;
    expires: number;
  }
>();

// Clean up expired tokens every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    const entries = Array.from(authTokens.entries());
    for (const [token, data] of entries) {
      if (now > data.expires) {
        authTokens.delete(token);
      }
    }
  },
  5 * 60 * 1000,
);

const getOidcConfig = memoize(
  async () => {
    if (!process.env.REPL_ID) {
      throw new Error(
        "REPL_ID environment variable is required for authentication",
      );
    }

    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!,
    );
  },
  { maxAge: 3600 * 1000 },
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
      secure: true,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
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
    verified: passport.AuthenticateCallback,
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Get domains from environment and add the actual current domain
  const envDomains = process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(",").filter((d) => d.trim())
    : [];

  // Extract the current domain by replacing .replit.dev with .repl.co if needed
  const currentDomain =
    envDomains.length > 0 && envDomains[0]
      ? envDomains[0].replace(".replit.dev", ".repl.co")
      : null;

  // Combine and deduplicate domains, filtering out null values
  const allDomains = Array.from(
    new Set([...envDomains, currentDomain].filter(Boolean)),
  );

  // If no domains are configured, use a fallback domain based on environment
  // This ensures at least one strategy is registered for authentication to work
  if (allDomains.length === 0) {
    console.warn(
      "No domains configured for authentication. Using fallback domain registration.",
    );
    // Use a fallback domain that will be overridden by req.hostname at request time
    allDomains.push("localhost:5000");
  }

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

  app.get("/api/login", async (req, res, next) => {
    // Find the canonical .replit.dev domain from REPLIT_DOMAINS
    const envDomains = process.env.REPLIT_DOMAINS
      ? process.env.REPLIT_DOMAINS.split(",").filter((d) => d.trim())
      : [];
    const canonicalDomain =
      envDomains.find((domain) => domain.includes(".replit.dev")) ||
      envDomains[0];

    // Build allowed domains, using req.hostname as fallback if env is not configured
    const allowedDomains = new Set([...envDomains, req.hostname]);

    // If user is on .repl.co domain and canonicalDomain exists, redirect to canonical for auth
    if (
      req.hostname.includes(".repl.co") &&
      canonicalDomain &&
      canonicalDomain !== req.hostname
    ) {
      // Security: Only allow redirect to verified domains
      if (!allowedDomains.has(req.hostname)) {
        return res.status(400).send("Invalid domain");
      }

      const originalDomain = encodeURIComponent(req.hostname);
      return res.redirect(
        `https://${canonicalDomain}/api/login?return_domain=${originalDomain}`,
      );
    }

    // Validate return_domain parameter if present (security check)
    if (req.query.return_domain) {
      const returnDomain = decodeURIComponent(
        req.query.return_domain as string,
      );
      if (!allowedDomains.has(returnDomain)) {
        return res.status(400).send("Invalid return domain");
      }
    }

    // Use canonical domain for authentication or current domain as fallback
    const authDomain = canonicalDomain || req.hostname;
    const strategyName = `replitauth:${authDomain}`;

    // Dynamically register strategy (handles empty REPLIT_DOMAINS)
    // passport.use() replaces existing strategies, so this is safe to call multiple times
    try {
      const strategy = new Strategy(
        {
          name: strategyName,
          config: await getOidcConfig(),
          scope: "openid email profile offline_access",
          callbackURL: `https://${authDomain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
    } catch (error) {
      console.error(
        `Failed to register auth strategy for ${authDomain}:`,
        error,
      );
      return res.status(500).send("Authentication configuration error");
    }

    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
      state: req.query.return_domain
        ? `return_domain=${req.query.return_domain}`
        : undefined,
    })(req, res, next);
  });

  app.get("/api/callback", async (req, res, next) => {
    // Use canonical domain for callback authentication
    const envDomains = process.env.REPLIT_DOMAINS
      ? process.env.REPLIT_DOMAINS.split(",").filter((d) => d.trim())
      : [];
    const canonicalDomain =
      envDomains.find((domain) => domain.includes(".replit.dev")) ||
      envDomains[0];
    const authDomain = canonicalDomain || req.hostname;
    const strategyName = `replitauth:${authDomain}`;

    // Dynamically register strategy (handles empty REPLIT_DOMAINS)
    // passport.use() replaces existing strategies, so this is safe to call multiple times
    try {
      const strategy = new Strategy(
        {
          name: strategyName,
          config: await getOidcConfig(),
          scope: "openid email profile offline_access",
          callbackURL: `https://${authDomain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
    } catch (error) {
      console.error(
        `Failed to register auth strategy for callback ${authDomain}:`,
        error,
      );
      return res.redirect("/api/login");
    }

    passport.authenticate(strategyName, {
      failureRedirect: "/api/login",
    })(req, res, (err: any) => {
      if (err) {
        return res.redirect("/api/login");
      }

      // Extract return domain from state parameter
      const state = req.query.state as string;
      let originalDomain: string | undefined;

      if (state && state.startsWith("return_domain=")) {
        originalDomain = decodeURIComponent(state.split("return_domain=")[1]);
      }

      if (originalDomain && originalDomain !== req.hostname) {
        // Security: Validate that originalDomain is in allowed domains
        const envDomains = process.env.REPLIT_DOMAINS
          ? process.env.REPLIT_DOMAINS.split(",")
          : [];
        const currentDomain =
          envDomains.length > 0
            ? envDomains[0].replace(".replit.dev", ".repl.co")
            : "48f9b286-e008-48ab-8187-58819bef2085-00-1zo3nkwdvuaba.janeway.repl.co";
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
          expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        });

        // Redirect to original domain with the token
        return res.redirect(
          `https://${originalDomain}/api/auth/complete?token=${token}`,
        );
      }

      // Same domain, normal redirect
      res.redirect("/");
    });
  });

  // Cross-domain authentication completion endpoint
  app.get("/api/auth/complete", async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
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

      req.login(
        {
          claims: userClaims,
          access_token: "cross_domain_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        },
        (err) => {
          if (err) {
            console.error("Failed to establish cross-domain session:", err);
            return res.redirect("/api/login");
          }
          res.redirect("/");
        },
      );
    } catch (error) {
      console.error("Error in cross-domain auth completion:", error);
      res.redirect("/api/login");
    }
  });



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
  const adminIds =
    process.env.ADMIN_USER_IDS?.split(",").map((id) => id.trim()) || [];

  // Check if user is in admin list
  if (!adminIds.includes(userId)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
};
