"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "eleven-callback");
const installHtml = fs.readFileSync(path.join(root, "install.html"));
const closeHtml = fs.readFileSync(path.join(root, "close.html"));
const swMarker = 'const CLOSE_HTML = "";';
const swTemplate = fs.readFileSync(path.join(root, "sw.js"), "utf8");
if (!swTemplate.includes(swMarker)) throw new Error("callback worker is missing CLOSE_HTML");
const swJs = swTemplate.replace(
  swMarker,
  "const CLOSE_HTML = " + JSON.stringify(closeHtml.toString("utf8")) + ";"
);

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

const hosts = ["127.0.0.1", "::1"];
let pending = hosts.length;
let listening = 0;

function finish(host, err) {
  if (err && err.code !== "EADDRINUSE") {
    console.error(host + ": " + err.message);
    process.exit(1);
  }
  if (err) console.error(host + ": already listening");
  pending -= 1;
  if (pending === 0 && listening === 0) process.exit(0);
}

function listen(host) {
  const server = http.createServer(handler);
  server.on("error", (err) => finish(host, err));
  server.listen(8484, host, () => {
    listening += 1;
    console.log("listening on " + host + ":8484");
    finish(host);
  });
}

hosts.forEach(listen);


