var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");


const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

const AWS = require("aws-sdk");
const s3 = new AWS.S3({
    accessKeyId: process.env.BUCKETEER_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.BUCKETEER_AWS_SECRET_ACCESS_KEY,
});

const upload = multer({ storage: storage, fileFilter: fileFilter });

// create application/json parser
var jsonParser = bodyParser.json();

const axios = require("axios");

const authFrc = Buffer.from(
    "silasvergiliobrazil:9c6795b5-e647-4a8e-b39b-be3d0c06729e"
).toString("base64");
const instanceFrc = axios.create({
    baseURL: "https://frc-api.firstinspires.org/v3.0",
    timeout: 3000,
    headers: {
        Authorization: `Basic ${authFrc}`,
    },
});

const authFtc = Buffer.from(
    "silasvergilio:0AAA5877-36CA-4343-B6F5-E5345BE9B078"
).toString("base64");
const instanceFtc = axios.create({
    baseURL: "https://ftc-api.firstinspires.org/v2.0/",
    timeout: 3000,
    headers: {
        Authorization: `Basic ${authFtc}`,
    },
});


/* GET event by eventCode from header */
router.get("/", function (req, res, next) {
    const eventCode = req.headers.eventcode; // pega o eventCode do header

    if (!eventCode) {
        return res.status(400).json({ message: "Header 'eventCode' não fornecido" });
    }

    const sql = "SELECT * FROM Events WHERE eventCode = ?";
    const values = [eventCode];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("Erro ao buscar evento:", err);
            return res.status(500).json({ message: "Erro interno" });
        }

        if (result.length === 0) {
            return res.status(404).json({ message: "Evento não encontrado" });
        }

        res.json(result[0]); // retorna o primeiro (e esperado único) registro
    });
});

router.post("/", jsonParser, async function (req, res) {
    try {
        const user = req.user;
        const roles = user["https://myapp.example.com/roles"] || [];
        if (!roles.includes("admin")) {
            return res.status(403).json({ message: "Acesso negado" });
        }

        const program = req.body.program.value;
        console.log("program", program)
        const instance = program == 'frc' ? instanceFrc : instanceFtc;
        const year = program == 'frc' ? '2026' : '2025';


        // 🔹 1. Buscar o evento na API da FIRST
        const eventsResponse = await instance.get(`${year}/events`, {
            params: { eventCode: req.body.eventCode },
        });
        // Seleciona a propriedade de acordo com o programa
        const eventsArray = program === 'frc'
            ? eventsResponse.data.Events
            : eventsResponse.data.events;

        // Valida o array
        if (eventsArray.length !== 1) {
            return res.status(400).json({ message: "Evento inválido" });
        }
        const event = program == 'frc' ? eventsResponse.data.Events[0] : eventsResponse.data.events[0];

        console.log("EVENTO", event)

        // 🔹 2. Inserir ou atualizar o evento
        const eventSql = `
        INSERT INTO Events (idEvent,eventCode, name, location, startDate, endDate, program)
        VALUES (?, ?, ?, ?, ?, ?,?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          location = VALUES(location),
          startDate = VALUES(startDate),
          endDate = VALUES(endDate)
      `;

        const eventValues = [
            uuidv4(),
            event.code,
            event.name,
            event.city,
            event.dateStart,
            event.dateEnd,
            program.value
        ];

        console.log("VALORES", eventValues)

        // Inserir evento e obter o ID correspondente
        const eventId = await new Promise((resolve, reject) => {
            db.query(eventSql, eventValues, function (err, result) {
                if (err) return reject(err);

                if (result.insertId) {
                    console.log("✅ Novo evento inserido:", event.code);
                    resolve(result.insertId);
                } else {
                    // Já existia — buscar o ID atual
                    db.query(
                        "SELECT idEvent FROM Events WHERE eventCode = ?",
                        [event.code],
                        function (err, rows) {
                            if (err) return reject(err);
                            console.log("ℹ️ Evento já existia:", event.code);
                            resolve(rows[0].idEvent);
                        }
                    );
                }
            });
        });

        // 🔹 3. Buscar times do evento
        const teamsResponse = await instance.get(`${year}/teams`, {
            params: { eventCode: req.body.eventCode },
        });

        const teams = teamsResponse.data.teams;
        console.log("Teams", teams);

        // 🔹 4. Inserir/atualizar times com o eventId
        const teamSql = `
        INSERT INTO Teams (idTeams, state, text, value, school, visitedMCI, visitedTA, visitedExtra, Events_idEvent)
        VALUES (?,?, ?, ?, ?, false, false, false, ?)
        ON DUPLICATE KEY UPDATE
          state = VALUES(state),
          text = VALUES(text),
          school = VALUES(school),
          Events_idEvent = VALUES(Events_idEvent)
      `;

        await Promise.all(
            teams.map((team) => {
                const values = [
                    uuidv4(),
                    team.stateProv,
                    team.nameShort,
                    team.teamNumber,
                    team.schoolName,
                    eventId,
                ];

                return new Promise((resolve, reject) => {
                    db.query(teamSql, values, function (err) {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            })
        );

        console.log(`✅ ${teams.length} times inseridos para o evento ${event.code}`);

        res.json({
            message: `Evento ${event.code} e ${teams.length} times inseridos/atualizados com sucesso.`,
        });
    } catch (error) {
        console.error("❌ Erro ao processar:", error);
        res.status(500).json({ message: "Erro interno" });
    }
});
module.exports = router;
