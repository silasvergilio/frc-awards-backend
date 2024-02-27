var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const multer = require("multer");

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
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const upload = multer({ storage: storage, fileFilter: fileFilter });

// create application/json parser
var jsonParser = bodyParser.json();

const axios = require("axios");

const auth = Buffer.from(
  "silasvergiliobrazil:9c6795b5-e647-4a8e-b39b-be3d0c06729e"
).toString("base64");
const instance = axios.create({
  baseURL: "https://frc-api.firstinspires.org/v3.0",
  timeout: 3000,
  headers: {
    Authorization: `Basic ${auth}`,
  },
});

/* GET teams listing. */
router.get("/", function (req, res, next) {
  var paramsGetFiles = {
    Bucket: process.env.S3_BUCKET,
  };
  var myFilesData = [];
  s3.listObjects(paramsGetFiles, function (err, data) {
    if (err) throw err;
    myFilesData = data.Contents;

    //console.log(req.user());
    var sql = "SELECT * FROM Teams ORDER BY Teams.value";
    db.query(sql, (err, result) => {
      result.forEach((element) => {
        console.log("check image");
        imageFile = myFilesData.filter((file) => {
          return (
            file.Key.includes(element.value) && file.Key.includes("picture")
          );
        });
        if (imageFile.length > 0) {
          console.log("Image File", imageFile);
          element.imageLink = `https://bucketeer-dd8b11fb-c2ce-40a9-84a9-db3c9d5a341c.s3.us-east-1.amazonaws.com/${element.value}-picture`;
        }
      });
      if (err) throw err;
      res.send(result);
    });
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

/* GET teams listing by teamNumber. */
router.put("/:value", jsonParser, function (req, res, next) {
  console.log(req.body);
  var sql = "UPDATE Teams SET ?? = ? WHERE value = ?";
  var values = [req.body.visit, req.body.newValue, req.params.value];
  db.query(sql, values, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

router.post("/picture", upload.single("file"), async function (req, res) {
  const file = req.file;
  console.log(req.body.bodyReq);
  const reqData = JSON.parse(req.body.bodyReq);
  console.log(reqData);

  if (file) {
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: `${reqData.value}-picture`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await s3.upload(params).promise();
      console.log("File uploaded to S3 successfully!");
      res.send({
        message: "Foto Adicionada com sucesso",
      });
    } catch (error) {
      console.error(error);
      res.sendStatus(500).send({
        Message: "Erro ao adicionar a foto",
      });
    }
  }
});

router.post("/", jsonParser, function (req, res) {
  if (req.query.bulk == "true") {
    var count = 0;
    console.log("Bulk initiating");
    instance
      .get("2024/teams", {
        params: {
          eventCode: "BRBR",
        },
      })
      .then(function (response) {
        console.log("Sucesso", response.data.teams);
        response.data.teams.forEach((element) => {
          var sql =
            "INSERT IGNORE INTO Teams (state,text,value,school, visitedMCI, visitedTA, visitedExtra) VALUES (?,?,?,?,false,false,false)";
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
    var sql =
      "INSERT INTO Teams (state,text,value,school, visitedMCI, visitedTA, visitedExtra) VALUES (?,?,?,?,false,false,false)";
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
