var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
var jsonParser = bodyParser.json();
const { v4: uuidv4 } = require("uuid");

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

// ── GET /api/pairs ─────────────────────────────────────────────────────────────
// Returns all pairs for the event, each with their judges (including role) and teams.
router.get("/", async function (req, res) {
  const eventCode = req.headers["eventcode"];
  if (!eventCode)
    return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });

  try {
    const eventId = await getEventId(eventCode);
    const pairs = await query(
      "SELECT idPair, type FROM Pairs WHERE Events_idEvent = ? ORDER BY sortOrder",
      [eventId]
    );

    const result = await Promise.all(
      pairs.map(async ({ idPair, type }) => {
        const judges = await query(
          `SELECT j.idJudges, j.judgeName, pj.role
           FROM PairJudges pj
           JOIN Judges j ON j.idJudges = pj.Judges_idJudges
           WHERE pj.Pairs_idPair = ?`,
          [idPair]
        );
        const teams = await query(
          `SELECT t.idTeams, t.value, t.text
           FROM PairTeams pt
           JOIN Teams t ON t.idTeams = pt.Teams_idTeams
           WHERE pt.Pairs_idPair = ?`,
          [idPair]
        );
        return {
          idPair,
          type: type ?? null,
          judges: judges.map((j) => ({ ...j, role: j.role ?? null })),
          teams,
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("❌ GET /pairs:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/pairs ────────────────────────────────────────────────────────────
// Creates a new empty pair for the event.
router.post("/", jsonParser, async function (req, res) {
  const eventCode = req.headers["eventcode"];
  if (!eventCode)
    return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });

  try {
    const eventId = await getEventId(eventCode);
    const [{ maxOrder }] = await query(
      "SELECT COALESCE(MAX(sortOrder), 0) AS maxOrder FROM Pairs WHERE Events_idEvent = ?",
      [eventId]
    );
    const idPair = uuidv4();
    await query(
      "INSERT INTO Pairs (idPair, Events_idEvent, sortOrder) VALUES (?, ?, ?)",
      [idPair, eventId, maxOrder + 1]
    );
    res.status(201).json({ idPair });
  } catch (err) {
    console.error("❌ POST /pairs:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PUT /api/pairs/distribute ──────────────────────────────────────────────────
// Bulk-replaces all team assignments across the given pairs.
// Body: { distribution: [{ pairId, teamIds: [uuid, ...] }] }
// NOTE: defined before /:idPair routes to avoid param capture on PUT.
router.put("/distribute", jsonParser, async function (req, res) {
  const { distribution } = req.body;
  if (!distribution || !Array.isArray(distribution))
    return res.status(400).json({ message: "'distribution' é obrigatório" });

  try {
    const pairIds = distribution.map((d) => d.pairId);
    if (pairIds.length > 0) {
      await query(
        `DELETE FROM PairTeams WHERE Pairs_idPair IN (${pairIds.map(() => "?").join(",")})`,
        pairIds
      );
    }

    for (const { pairId, teamIds } of distribution) {
      for (const teamId of teamIds) {
        await query(
          "INSERT INTO PairTeams (Pairs_idPair, Teams_idTeams) VALUES (?, ?)",
          [pairId, teamId]
        );
      }
    }

    res.json({ message: "Distribuição salva" });
  } catch (err) {
    console.error("❌ PUT /pairs/distribute:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PATCH /api/pairs/:idPair/type ─────────────────────────────────────────────
// Sets the pair type: 'mci', 'ta', or null (clear).
router.patch("/:idPair/type", jsonParser, async function (req, res) {
  const { type } = req.body; // 'mci' | 'ta' | null
  try {
    await query("UPDATE Pairs SET type = ? WHERE idPair = ?", [type ?? null, req.params.idPair]);
    res.json({ message: "Tipo atualizado" });
  } catch (err) {
    console.error("❌ PATCH /pairs/:idPair/type:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/pairs/:idPair ──────────────────────────────────────────────────
// Deletes a pair; ON DELETE CASCADE removes its PairJudges and PairTeams rows.
router.delete("/:idPair", async function (req, res) {
  try {
    await query("DELETE FROM Pairs WHERE idPair = ?", [req.params.idPair]);
    res.json({ message: "Dupla removida" });
  } catch (err) {
    console.error("❌ DELETE /pairs/:idPair:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/pairs/:idPair/judges ─────────────────────────────────────────────
router.post("/:idPair/judges", jsonParser, async function (req, res) {
  const { judgeId } = req.body;
  if (!judgeId)
    return res.status(400).json({ message: "judgeId é obrigatório" });

  try {
    await query(
      "INSERT IGNORE INTO PairJudges (Pairs_idPair, Judges_idJudges) VALUES (?, ?)",
      [req.params.idPair, judgeId]
    );
    res.status(201).json({ message: "Juiz adicionado" });
  } catch (err) {
    console.error("❌ POST /pairs/:idPair/judges:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PATCH /api/pairs/:idPair/judges/:judgeId/role ──────────────────────────────
// Sets the Day-2 role (A/B for MCI, C/D for TA) for a judge within a pair.
router.patch("/:idPair/judges/:judgeId/role", jsonParser, async function (req, res) {
  const { role } = req.body; // 'A' | 'B' | 'C' | 'D' | null
  try {
    await query(
      "UPDATE PairJudges SET role = ? WHERE Pairs_idPair = ? AND Judges_idJudges = ?",
      [role ?? null, req.params.idPair, req.params.judgeId]
    );
    res.json({ message: "Role atualizado" });
  } catch (err) {
    console.error("❌ PATCH /pairs/:idPair/judges/:judgeId/role:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/pairs/:idPair/judges/:judgeId ──────────────────────────────────
router.delete("/:idPair/judges/:judgeId", async function (req, res) {
  try {
    await query(
      "DELETE FROM PairJudges WHERE Pairs_idPair = ? AND Judges_idJudges = ?",
      [req.params.idPair, req.params.judgeId]
    );
    res.json({ message: "Juiz removido" });
  } catch (err) {
    console.error("❌ DELETE /pairs/:idPair/judges/:judgeId:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/pairs/:idPair/teams ──────────────────────────────────────────────
router.post("/:idPair/teams", jsonParser, async function (req, res) {
  const { teamId } = req.body;
  if (!teamId)
    return res.status(400).json({ message: "teamId é obrigatório" });

  try {
    await query(
      "INSERT IGNORE INTO PairTeams (Pairs_idPair, Teams_idTeams) VALUES (?, ?)",
      [req.params.idPair, teamId]
    );
    res.status(201).json({ message: "Time adicionado" });
  } catch (err) {
    console.error("❌ POST /pairs/:idPair/teams:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/pairs/:idPair/teams/:teamId ────────────────────────────────────
router.delete("/:idPair/teams/:teamId", async function (req, res) {
  try {
    await query(
      "DELETE FROM PairTeams WHERE Pairs_idPair = ? AND Teams_idTeams = ?",
      [req.params.idPair, req.params.teamId]
    );
    res.json({ message: "Time removido" });
  } catch (err) {
    console.error("❌ DELETE /pairs/:idPair/teams/:teamId:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

module.exports = router;
