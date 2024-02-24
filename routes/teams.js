var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");

// create application/json parser
var jsonParser = bodyParser.json();

const axios = require("axios");

const auth = Buffer.from(
  "silasvergilio:0AAA5877-36CA-4343-B6F5-E5345BE9B078"
).toString("base64");
const instance = axios.create({
  baseURL: "https://ftc-api.firstinspires.org/v2.0/",
  timeout: 3000,
  headers: {
    Authorization: `Basic ${auth}`,
  },
});

/* GET teams listing. */
router.get("/", function (req, res, next) {
  //console.log(req.user());
  var sql = "SELECT * FROM Teams";
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

/* GET teams listing by teamNumber. */
router.get("/:value", function (req, res, next) {
  var sql = "SELECT * FROM Teams WHERE value = ?";
  var values = [req.params.value];
  db.query(sql, values, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

router.post("/", jsonParser, function (req, res) {
  if (req.query.bulk == "true") {
    var count = 0;
    console.log("Bulk initiating");
    instance
      .get("2023/teams", {
        params: {
          eventCode: "BRCMP",
        },
      })
      .then(function (response) {
        console.log("Sucesso", response.data.teams);
        response.data.teams.forEach((element) => {
          var sql =
            "INSERT IGNORE INTO Teams (state,text,value,school) VALUES (?,?,?,?)";
          var values = [
            element.stateProv,
            element.nameShort,
            element.teamNumber,
            element.schoolName,
          ];

          db.query(sql, values, function (err, result) {
            if (err) throw err;
            count++;
            console.log("1 record inserted");
          });
        });
      })
      .catch(function (error) {
        console.log("Erro", error);
        res.sendStatus(500);
      })
      .finally(function () {
        res.send({
          count: count,
        });
      });
  } else {
    var sql = "INSERT INTO Teams (state,text,value,school) VALUES (?,?,?,?)";
    var values = [
      req.body.state,
      req.body.text,
      req.body.value,
      req.body.school,
    ];

    db.query(sql, values, function (err, result) {
      if (err) throw err;
     // console.log("1 record inserted");
    });
    res.send(req.body.state);
  }
});

module.exports = router;
