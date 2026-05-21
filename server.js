const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_ROOT = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || ROOT);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Clear-Site-Data": "\"cache\"",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const filePath = path.normalize(path.join(ROOT, decoded === "/" ? "index.html" : decoded));
  return filePath.startsWith(ROOT) ? filePath : null;
}

function dataFile(reqUrl) {
  const parsed = new URL(reqUrl, `http://localhost:${PORT}`);
  const key = (parsed.searchParams.get("company") || "default").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "default";
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
  const companyFile = path.join(DATA_ROOT, `attendpro-data-${key}.json`);
  return companyFile;
}

function datasetPassword(req) {
  return String(req.headers["x-dataset-password"] || "");
}

function statePassword(state) {
  return String((state && state.datasetPassword) || "");
}

function canAccessState(req, state) {
  const savedPassword = statePassword(state);
  return savedPassword && datasetPassword(req) === savedPassword;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  if (req.url.startsWith("/healthz")) {
    send(res, 200, JSON.stringify({ ok: true }));
    return;
  }

  if (req.url.startsWith("/api/state") && req.method === "GET") {
    const DATA_FILE = dataFile(req.url);
    if (!fs.existsSync(DATA_FILE)) {
      send(res, 404, JSON.stringify({ error: "No shared state saved yet" }));
      return;
    }
    const body = fs.readFileSync(DATA_FILE, "utf8");
    const state = JSON.parse(body);
    if (!canAccessState(req, state)) {
      send(res, 401, JSON.stringify({ error: "Invalid dataset password" }));
      return;
    }
    send(res, 200, body);
    return;
  }

  if (req.url.startsWith("/api/state") && req.method === "POST") {
    try {
      const DATA_FILE = dataFile(req.url);
      const body = await readBody(req);
      const next = JSON.parse(body);
      if (fs.existsSync(DATA_FILE)) {
        const current = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        if (!canAccessState(req, current)) {
          send(res, 401, JSON.stringify({ error: "Invalid dataset password" }));
          return;
        }
        next.datasetPassword = statePassword(current);
      } else if (!statePassword(next)) {
        send(res, 400, JSON.stringify({ error: "Dataset password is required" }));
        return;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(next), "utf8");
      send(res, 200, JSON.stringify({ ok: true }));
    } catch (error) {
      send(res, 400, JSON.stringify({ error: error.message }));
    }
    return;
  }

  const filePath = safeFilePath(req.url);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  if (/^attendpro-data.*\.json$/i.test(path.basename(filePath))) {
    send(res, 403, "Dataset files are private", "text/plain; charset=utf-8");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, fs.readFileSync(filePath), MIME[ext] || "application/octet-stream");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AttendPro running at http://localhost:${PORT}`);
});
