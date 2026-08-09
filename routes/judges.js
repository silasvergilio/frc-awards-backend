var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
var jsonParser = bodyParser.json();
const { v4: uuidv4 } = require("uuid");

// ── Helper ────────────────────────────────────────────────────────────────────
function query(sql, params) {
  return new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

// ── GET /api/judges ───────────────────────────────────────────────────────────
// Returns all judges for the event, each with their conflict teams.
router.get("/", async function (req, res) {
  const eventCode = req.headers["eventcode"];
  if (!eventCode)
    return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });

  try {
    const events = await query("SELECT idEvent FROM Events WHERE eventCode = ?", [eventCode]);
    if (!events.length) return res.status(404).json({ message: "Evento não encontrado" });
    const eventId = events[0].idEvent;

    const judges = await query("SELECT * FROM Judges WHERE Events_idEvent = ?", [eventId]);

    const result = await Promise.all(
      judges.map(async (judge) => {
        const conflicts = await query(
          `SELECT t.idTeams, t.value, t.text
           FROM JudgeConflicts jc
           JOIN Teams t ON t.idTeams = jc.Teams_idTeams
           WHERE jc.Judges_idJudges = ?`,
          [judge.idJudges]
        );
        return { ...judge, conflicts };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("❌ GET /judges:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/judges ──────────────────────────────────────────────────────────
router.post("/", jsonParser, async function (req, res) {
  try {
    const eventCode = req.headers["eventcode"];
    const user = req.user;
    const roles = user?.["https://myapp.example.com/roles"] ?? [];
    if (!roles.includes("admin"))
      return res.status(403).json({ message: "Acesso negado" });

    const idJudges = uuidv4();
    await query(
      `INSERT INTO Judges (idJudges, judgeName, Events_idEvent)
       VALUES (?, ?, (SELECT idEvent FROM Events WHERE eventCode = ?))`,
      [idJudges, req.body.judgeName, eventCode]
    );

    res.status(201).json({ idJudges, judgeName: req.body.judgeName, conflicts: [] });
  } catch (err) {
    console.error("❌ POST /judges:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/judges/:judgeId ───────────────────────────────────────────────
// ON DELETE CASCADE on JudgeConflicts handles cleanup automatically.
router.delete("/:judgeId", async function (req, res) {
  try {
    const user = req.user;
    const roles = user?.["https://myapp.example.com/roles"] ?? [];
    if (!roles.includes("admin"))
      return res.status(403).json({ message: "Acesso negado" });

    await query("DELETE FROM Judges WHERE idJudges = ?", [req.params.judgeId]);
    res.json({ message: "Juiz removido com sucesso" });
  } catch (err) {
    console.error("❌ DELETE /judges/:judgeId:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/judges/:judgeId/conflicts ───────────────────────────────────────
router.post("/:judgeId/conflicts", jsonParser, async function (req, res) {
  const { teamId } = req.body;
  if (!teamId) return res.status(400).json({ message: "teamId é obrigatório" });

  try {
    await query(
      "INSERT IGNORE INTO JudgeConflicts (Judges_idJudges, Teams_idTeams) VALUES (?, ?)",
      [req.params.judgeId, teamId]
    );
    res.status(201).json({ message: "Conflito adicionado" });
  } catch (err) {
    console.error("❌ POST /judges/:judgeId/conflicts:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/judges/:judgeId/conflicts/:teamId ─────────────────────────────
router.delete("/:judgeId/conflicts/:teamId", async function (req, res) {
  try {
    await query(
      "DELETE FROM JudgeConflicts WHERE Judges_idJudges = ? AND Teams_idTeams = ?",
      [req.params.judgeId, req.params.teamId]
    );
    res.json({ message: "Conflito removido" });
  } catch (err) {
    console.error("❌ DELETE /judges/:judgeId/conflicts/:teamId:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

module.exports = router;
