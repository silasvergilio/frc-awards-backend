var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
var jsonParser = bodyParser.json();

// ── Helpers ───────────────────────────────────────────────────────────────────

function query(sql, params) {
  return new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

async function getEventId(eventCode) {
  const rows = await query("SELECT idEvent FROM Events WHERE eventCode = ?", [eventCode]);
  if (!rows.length) throw new Error("Evento não encontrado");
  return rows[0].idEvent;
}

// ── GET /api/award-groups ─────────────────────────────────────────────────────
// Returns all Day-2 award-group assignments for the event.
// Returns an empty array (not an error) if none have been saved yet —
// the frontend applies its own defaults in that case.
router.get("/", async function (req, res) {
  const eventCode = req.headers["eventcode"];
  if (!eventCode)
    return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });

  try {
    const eventId = await getEventId(eventCode);
    const rows = await query(
      "SELECT awardName, pairType, day2Group FROM Day2AwardGroups WHERE Events_idEvent = ?",
      [eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /award-groups:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PUT /api/award-groups ─────────────────────────────────────────────────────
// Bulk-upserts award → Day-2-group assignments for the event.
// Body: { assignments: [{ awardName, pairType, day2Group }, ...] }
router.put("/", jsonParser, async function (req, res) {
  const eventCode = req.headers["eventcode"];
  if (!eventCode)
    return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });

  const { assignments } = req.body;
  if (!assignments || !Array.isArray(assignments))
    return res.status(400).json({ message: "'assignments' é obrigatório" });

  try {
    const eventId = await getEventId(eventCode);

    for (const { awardName, pairType, day2Group } of assignments) {
      await query(
        `INSERT INTO Day2AwardGroups (Events_idEvent, awardName, pairType, day2Group)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE day2Group = VALUES(day2Group)`,
        [eventId, awardName, pairType, day2Group ?? null]
      );
    }

    res.json({ message: "Grupos salvos" });
  } catch (err) {
    console.error("❌ PUT /award-groups:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

module.exports = router;
