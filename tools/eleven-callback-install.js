"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "eleven-callback");
const installHtml = fs.readFileSync(path.join(root, "install.html"));
const swJs = fs.readFileSync(path.join(root, "sw.js"));
const closeHtml = fs.readFileSync(path.join(root, "close.html"));

function handler(req, res) {
  const name = new URL(req.url, "http://localhost:8484").pathname;
  console.log(name);
  if (name === "/sw.js") {
    res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
    res.end(swJs);
    return;
  }
  if (name === "/callback" || name === "/callback/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(closeHtml);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(installHtml);
}

function listen(host) {
  const server = http.createServer(handler);
  server.on("error", (err) => {
    console.error(host + ": " + err.message);
  });
  server.listen(8484, host, () => {
    console.log("listening on " + host + ":8484");
  });
}

listen("127.0.0.1");
listen("::1");
