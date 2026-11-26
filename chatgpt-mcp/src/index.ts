import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { env, envReadiness, isOAuthFullyConfigured, mcpEndpointUrl } from "./env.js";
import { createMcpServer } from "./mcp/server.js";
import { AuthError, resolveBearerSession } from "./oauth/tokens.js";
import { mountOAuthRoutes, oauthWwwAuthenticate } from "./oauth/routes.js";

const app = express();

const CORS_ALLOW = [
  /^https:\/\/([a-z0-9-]+\.)?chatgpt\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)?openai\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)?oaistatic\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)?netppay\.com$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser / same-origin (no Origin header)
      if (!origin) return callback(null, true);
      if (CORS_ALLOW.some((re) => re.test(origin))) return callback(null, true);
      return callback(null, false);
    },
    exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "Last-Event-ID",
    ],
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

mountOAuthRoutes(app);

// Preflight / discovery helpers
app.options("/mcp", (_req, res) => {
  res.status(204).end();
});

app.get("/health", (_req, res) => {
  const envFlags = envReadiness();
  const oauthReady = isOAuthFullyConfigured();
  res.status(oauthReady ? 200 : 503).json({
    ok: oauthReady,
    service: "netpay-chatgpt-mcp",
    mcp: mcpEndpointUrl(),
    oauth_configured: oauthReady,
    env: envFlags,
  });
});

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
  userId: string;
};

const sessions = new Map<string, SessionEntry>();

function clientIp(req: express.Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || null;
}

async function handleMcp(req: express.Request, res: express.Response) {
  try {
    const session = await resolveBearerSession(req.headers.authorization);
    const ip = clientIp(req);
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    if (sessionId && sessions.has(sessionId)) {
      const existing = sessions.get(sessionId)!;
      if (existing.userId !== session.userId) {
        oauthWwwAuthenticate(res, "invalid_token");
        return res.status(401).json({ error: "session_user_mismatch" });
      }
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
      });
      const mcp = createMcpServer(session, ip);
      await mcp.connect(transport);

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };

      await transport.handleRequest(req, res, req.body);
      if (transport.sessionId) {
        sessions.set(transport.sessionId, { transport, userId: session.userId });
      }
      return;
    }

    // Stateless single-shot (no prior session) — still require auth
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const mcp = createMcpServer(session, ip);
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (error instanceof AuthError) {
      oauthWwwAuthenticate(res, error.code);
      return res.status(401).json({
        error: error.code,
        error_description: error.message,
      });
    }
    console.error("MCP error", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" },
        id: null,
      });
    }
  }
}

app.all("/mcp", (req, res) => {
  void handleMcp(req, res);
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><title>NetPay MCP</title></head>
<body style="font-family:system-ui;padding:2rem;background:#0f1115;color:#f5f5f5">
  <h1 style="color:#FF7F00">NetPay · ChatGPT MCP</h1>
  <p>MCP endpoint: <code>${mcpEndpointUrl()}</code></p>
  <p>OAuth metadata: <code>${env.mcpPublicUrl}/.well-known/oauth-authorization-server</code></p>
</body></html>`);
});

// Vercel / serverless export
export default app;

// Local / traditional Node listen
if (process.env.VERCEL !== "1" && !process.env.VERCEL_ENV) {
  const port = env.port;
  app.listen(port, () => {
    console.log(`NetPay MCP listening on http://localhost:${port}/mcp`);
  });
}
