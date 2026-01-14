/**
 * Minimal HTTP server for vapush
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Vapush } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  subject?: string;
  /** Custom static files directory (defaults to built-in public/) */
  publicDir?: string;
  /** Pre-set secret (otherwise auto-generated) */
  secret?: string;
}

export async function createServer(options: ServerOptions = {}): Promise<http.Server> {
  const port = options.port ?? 3000;
  const host = options.host ?? "0.0.0.0";
  const dataDir = options.dataDir ?? path.join(process.cwd(), ".vapush");

  const vapush = new Vapush({
    dataDir,
    subject: options.subject,
  });
  await vapush.init();

  // Load or create secret
  const secretFile = path.join(dataDir, "secret");
  let secret: string;
  try {
    secret = fs.readFileSync(secretFile, "utf-8").trim();
  } catch {
    secret = options.secret ?? crypto.randomBytes(16).toString("base64url");
    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.writeFile(secretFile, secret, { mode: 0o600 });
  }

  // Look for public dir - check custom, then package location
  const publicDir = options.publicDir ?? path.join(__dirname, "..", "public");

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Helper to check secret from body or URL path
      const checkSecret = (provided: string | undefined): boolean => {
        return provided === secret;
      };

      const unauthorized = () => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid secret" }));
      };

      const badRequest = (msg: string) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      };

      // API routes

      // Public - just returns VAPID public key
      if (url.pathname === "/api/public-key") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ publicKey: vapush.getPublicKey() }));
        return;
      }

      // Requires secret in body
      if (url.pathname === "/api/subscribe" && req.method === "POST") {
        const body = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return badRequest("Invalid JSON");
        }
        const { id, subscription, name, secret: providedSecret } = parsed;
        if (!checkSecret(providedSecret)) return unauthorized();
        await vapush.subscribe(id, subscription, name);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Requires secret in body
      if (url.pathname === "/api/unsubscribe" && req.method === "POST") {
        const body = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return badRequest("Invalid JSON");
        }
        const { id, secret: providedSecret } = parsed;
        if (!checkSecret(providedSecret)) return unauthorized();
        const removed = await vapush.unsubscribe(id);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, removed }));
        return;
      }

      // Requires secret in URL: /api/subscriptions/SECRET
      const subsMatch = url.pathname.match(/^\/api\/subscriptions\/(.+)$/);
      if (subsMatch && req.method === "GET") {
        if (!checkSecret(subsMatch[1])) return unauthorized();
        const subs = vapush.getSubscriptions();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(subs));
        return;
      }

      // Requires secret in URL: /api/push/SECRET
      const pushMatch = url.pathname.match(/^\/api\/push\/(.+)$/);
      if (pushMatch && req.method === "POST") {
        if (!checkSecret(pushMatch[1])) return unauthorized();
        const body = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return badRequest("Invalid JSON");
        }
        const { title, body: msgBody, url: msgUrl } = parsed;
        const result = await vapush.push(title, msgBody, msgUrl);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // Static files
    let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      const ext = path.extname(filePath);
      const contentType: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };

      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType[ext] ?? "application/octet-stream" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    } catch (err) {
      console.error("Request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`vapush server running at http://${host}:${port}`);
      console.log(`Secret: ${secret}`);
      console.log();
      console.log(`Subscribe URL: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/#s=${secret}`);
      console.log();
      console.log(`Send a push:`);
      console.log(`  curl -X POST http://localhost:${port}/api/push/${secret} \\`);
      console.log(`    -H "Content-Type: application/json" \\`);
      console.log(`    -d '{"title":"Test","body":"Hello!"}'`);
      resolve(server);
    });
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
