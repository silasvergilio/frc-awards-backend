const { Server } = require("socket.io");

const CORS_ORIGINS = [
  "https://frc-awards-front.vercel.app",
  "http://localhost:8081",
  "http://localhost:8080",
];

/** @type {import("socket.io").Server|null} */
let io = null;

/**
 * Attach Socket.IO to the HTTP server. Call once from bin/www after
 * the server is created.
 */
function init(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    // Clients join a room named after their eventCode so broadcasts
    // only reach users watching the same event.
    socket.on("join", (eventCode) => {
      if (typeof eventCode === "string" && eventCode) {
        socket.join(eventCode);
      }
    });
    socket.on("leave", (eventCode) => {
      if (typeof eventCode === "string") socket.leave(eventCode);
    });
  });

  return io;
}

/**
 * Broadcast an event to everyone watching a specific event room.
 * Safe to call before init() — will silently no-op if not yet ready.
 */
function emit(eventCode, event, data = {}) {
  if (io && eventCode) io.to(eventCode).emit(event, data);
}

module.exports = { init, emit };
