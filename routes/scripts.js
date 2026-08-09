const express    = require("express");
const bodyParser = require("body-parser");
const router     = express.Router();
const db         = require("../connection");
const { v4: uuidv4 } = require("uuid");
const jsonParser = bodyParser.json();
const socketManager = require("../lib/socket");

function query(sql, params) {
  return new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

function isAdmin(req) {
  return (req.user?.["https://myapp.example.com/roles"] ?? []).includes("admin");
}

async function getEventCodeByScript(scriptId) {
  const rows = await query(
    `SELECT e.eventCode FROM Scripts s
     JOIN Events e ON e.idEvent = s.Events_idEvent
     WHERE s.idScripts = ? LIMIT 1`,
    [scriptId]
  );
  return rows[0]?.eventCode ?? null;
}

// ── GET /api/scripts ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "eventCode header required" });

  try {
    const rows = await query(
      `SELECT s.*
       FROM Scripts s
       JOIN Events e ON e.idEvent = s.Events_idEvent
       WHERE e.eventCode = ?
       ORDER BY s.createdAt DESC`,
      [eventCode]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /scripts:", err.message);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── POST /api/scripts ─────────────────────────────────────────────────────────
// Any authenticated user can submit a script; it starts as 'pending'.
router.post("/", jsonParser, async (req, res) => {
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "eventCode header required" });

  const { awardName, teamNumber, teamName, scriptText } = req.body;
  if (!awardName || !teamNumber || !teamName) {
    return res.status(400).json({ message: "awardName, teamNumber, and teamName are required" });
  }
  // scriptText is optional for admins (Impact Award winner declaration without script)
  if (!scriptText && !isAdmin(req)) {
    return res.status(400).json({ message: "scriptText is required" });
  }

  const submittedBy = req.user?.name || req.user?.email || null;

  try {
    const events = await query("SELECT idEvent FROM Events WHERE eventCode = ?", [eventCode]);
    if (!events.length) return res.status(404).json({ message: "Event not found" });
    const eventId = events[0].idEvent;

    const id = uuidv4();
    await query(
      `INSERT INTO Scripts
         (idScripts, awardName, teamNumber, teamName, scriptText, status, submittedBy, Events_idEvent)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, awardName, teamNumber, teamName, scriptText, submittedBy, eventId]
    );

    socketManager.emit(eventCode, "scripts:changed");
    res.status(201).json({
      idScripts: id, awardName, teamNumber, teamName, scriptText,
      status: "pending", submittedBy,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A script already exists for this award. Use PATCH to update it." });
    }
    console.error("❌ POST /scripts:", err.message);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── PATCH /api/scripts/:id ────────────────────────────────────────────────────
// Resubmit an edited script — resets status to 'pending'.
router.patch("/:id", jsonParser, async (req, res) => {
  const { scriptText } = req.body;
  if (!scriptText) return res.status(400).json({ message: "scriptText is required" });

  try {
    await query(
      "UPDATE Scripts SET scriptText = ?, status = 'pending', updatedAt = NOW() WHERE idScripts = ?",
      [scriptText, req.params.id]
    );
    const eventCode = await getEventCodeByScript(req.params.id);
    socketManager.emit(eventCode, "scripts:changed");
    res.json({ message: "Script updated and resubmitted for review" });
  } catch (err) {
    console.error("❌ PATCH /scripts/:id:", err.message);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── PATCH /api/scripts/:id/winner ────────────────────────────────────────────
// Admin-only: update the winning team without touching the script or status.
router.patch("/:id/winner", jsonParser, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });

  const { teamNumber, teamName } = req.body;
  if (!teamNumber || !teamName) {
    return res.status(400).json({ message: "teamNumber and teamName are required" });
  }

  try {
    await query(
      "UPDATE Scripts SET teamNumber = ?, teamName = ?, updatedAt = NOW() WHERE idScripts = ?",
      [teamNumber, teamName, req.params.id]
    );
    const eventCode = await getEventCodeByScript(req.params.id);
    socketManager.emit(eventCode, "scripts:changed");
    res.json({ message: "Winner updated" });
  } catch (err) {
    console.error("❌ PATCH /scripts/:id/winner:", err.message);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── PATCH /api/scripts/:id/accept ─────────────────────────────────────────────
router.patch("/:id/accept", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });

  try {
    await query(
      "UPDATE Scripts SET status = 'accepted', updatedAt = NOW() WHERE idScripts = ?",
      [req.params.id]
    );
    const eventCode = await getEventCodeByScript(req.params.id);
    socketManager.emit(eventCode, "scripts:changed");
    res.json({ message: "Script accepted" });
  } catch (err) {
    console.error("❌ PATCH /scripts/:id/accept:", err.message);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── PATCH /api/scripts/:id/reject ─────────────────────────────────────────────
router.patch("/:id/reject", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });

  try {
    await query(
      "UPDATE Scripts SET status = 'rejected', updatedAt = NOW() WHERE idScripts = ?",
      [req.params.id]
    );
    const eventCode = await getEventCodeByScript(req.params.id);
    socketManager.emit(eventCode, "scripts:changed");
    res.json({ message: "Script sent back for revision" });
  } catch (err) {
    console.error("❌ PATCH /scripts/:id/reject:", err.message);
    res.status(500).json({ message: "Internal error" });
  }
});

module.exports = router;
