// ======================================================
// JobConnect server
// Serves the website files and one test route (/api/health).
// Uses only what comes built into Node.js, so nothing to install.
//
// The website is made of plain files (HTML, CSS, JS, logo). This server
// is only needed to test the site on your own phone, or to host it on a
// service that runs Node.js. GitHub Pages does not need it.
// ======================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

// The port the server listens on. Hosting services set PORT for us.
const PORT = process.env.PORT || 3000;

// The website files can live in a "public" folder OR directly next to this file.
const PUBLIC_FOLDER = path.join(__dirname, "public");
const PUBLIC_DIR = fs.existsSync(PUBLIC_FOLDER) ? PUBLIC_FOLDER : __dirname;

// Files that must never be sent to a visitor (needed when the site sits next to this file)
const PRIVATE_NAMES = new Set(["server.js", "package.json", "package-lock.json", "node_modules", "readme.md"]);

// Tells the browser what kind of file it is receiving
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon"
};


// Send a JSON reply (used by the /api routes)
function sendJSON(res, statusCode, data) {

    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}


// Send a plain text reply (used for errors)
function sendText(res, statusCode, message) {

    res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
}


// Is this address allowed to be served?
function isPrivate(relativePath) {

    return relativePath
        .split("/")
        .some(function (part) {
            return part.startsWith(".") || PRIVATE_NAMES.has(part.toLowerCase());
        });
}


// Find a file in the website folder and send it to the browser
async function serveFile(req, res, urlPath) {

    let relativePath;

    try {
        relativePath = decodeURIComponent(urlPath);
    } catch (error) {
        return sendText(res, 400, "Bad request");
    }

    // The home address "/" means index.html
    if (relativePath === "/") {
        relativePath = "/index.html";
    }

    const filePath = path.join(PUBLIC_DIR, relativePath);

    // Safety check: stop addresses like /../server.js from escaping the website folder
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
        return sendText(res, 403, "Forbidden");
    }

    // Server files and hidden files are never shared
    if (isPrivate(relativePath)) {
        return sendText(res, 404, "Page not found");
    }

    try {

        const data = await fs.promises.readFile(filePath);

        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

        res.writeHead(200, {
            "Content-Type": type,
            // Always fetch the newest copy, so changes show up right after a refresh
            "Cache-Control": "no-cache"
        });

        res.end(req.method === "HEAD" ? undefined : data);

    } catch (error) {

        sendText(res, 404, "Page not found");
    }
}


// This function runs once for every request that reaches the server
const server = http.createServer(async function (req, res) {

    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

    console.log(req.method + " " + url.pathname);

    // --- API routes (data) ---
    if (url.pathname === "/api/health") {
        return sendJSON(res, 200, {
            status: "ok",
            app: "JobConnect",
            time: new Date().toISOString()
        });
    }

    if (url.pathname.startsWith("/api/")) {
        return sendJSON(res, 404, { error: "Route not found" });
    }

    // --- Everything else: website files ---
    if (req.method !== "GET" && req.method !== "HEAD") {
        return sendText(res, 405, "Method not allowed");
    }

    await serveFile(req, res, url.pathname);
});


// "0.0.0.0" means: accept connections on the IPv4 network (works with Chrome on Android)
server.listen(PORT, "0.0.0.0", function () {
    console.log("JobConnect is running.");
    console.log("Open this in Chrome:  http://127.0.0.1:" + PORT);
    console.log("Press CTRL + C to stop.");
});
