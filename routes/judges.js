var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");


// create application/json parser
var jsonParser = bodyParser.json();

const axios = require("axios");

router.get("/", function (req, res, next) {
    const eventCode = req.headers["eventcode"]; // header precisa ser "eventCode"

    if (!eventCode) {
        console.log("NO event code")
        return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });
    }

    // 🔹 1. Buscar o id do evento pelo eventCode
    const sqlEvent = "SELECT idEvent FROM Events WHERE eventCode = ?";
    db.query(sqlEvent, [eventCode], (err, eventResult) => {
        if (err) {
            console.error("Erro ao buscar evento:", err);
            return res.status(500).json({ message: "Erro ao buscar evento" });
        }

        if (eventResult.length === 0) {
            return res.status(404).json({ message: "Evento não encontrado" });
        }

        console.log(eventResult[0].idEvent);
        const eventId = eventResult[0].idEvent;

        // 🔹 2. Buscar todos os times relacionados a esse evento
        const sqlTeams = "SELECT * FROM Judges WHERE Events_idEvent = ?";
        db.query(sqlTeams, [eventId], (err, teamsResult) => {
            if (err) {
                console.error("Erro ao buscar times:", err);
                return res.status(500).json({ message: "Erro ao buscar times" });
            }

            res.json(teamsResult);
        });
    });
});

router.delete("/:judgeId", jsonParser, async function (req, res) {
    try {
        const user = req.user; // certifique-se que 'user' vem do middleware de autenticação
        const roles = user?.["https://myapp.example.com/roles"] || [];

        if (!roles.includes("admin")) {
            return res.status(403).json({ message: "Acesso negado" });
        }

        const { judgeId } = req.params;
        const { judgeName, eventCode } = req.body; // dados opcionais se quiser validar mais

        const deleteJudgeSql = `
            DELETE FROM Judges
            WHERE idJudges = ? AND Events_idEvent = (SELECT idEvent FROM Events WHERE eventCode = ?)
        `;

        const [result] = await req.db.execute(deleteJudgeSql, [judgeId, eventCode]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Juiz não encontrado ou já deletado" });
        }

        res.status(200).json({ message: "Juiz removido com sucesso" });
    } catch (error) {
        console.error("Erro ao deletar juiz:", error);
        res.status(500).json({ message: "Erro interno ao deletar juiz" });
    }
});
router.post("/", jsonParser, async function (req, res) {
    try {

        const eventCode = req.headers["eventcode"]; // header precisa ser "eventCode"
        const user = req.user;
        const roles = user["https://myapp.example.com/roles"] || [];
        if (!roles.includes("admin")) {
            return res.status(403).json({ message: "Acesso negado" });
        }

        // 🔹 2. Inserir ou atualizar o evento
        const judgesSql = `
        INSERT INTO Judges (idJudges, judgeName, Events_idEvent)
        VALUES (?, ?, (SELECT idEvent FROM Events WHERE eventCode = ?))`;

        console.log("red body", req.body)

        const judgesValues = [
            uuidv4(),
            req.body.judgeName,
            eventCode
        ];

        db.query(judgesSql, judgesValues, function (err, result) {
            if (err) {
                console.log(err);
                res.status(500).send({
                    SqlError: err,
                    errno: 1010,
                    Status: 500,
                });
            } else {
                console.log("1 record inserted");
                res.send("Inserted");
            }
        });
    } catch (error) {
        console.error("❌ Erro ao processar:", error.message);
        res.status(500).json({ message: "Erro interno" });
    }
});
module.exports = router;
