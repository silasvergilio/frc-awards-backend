var express = require("express");
var router = express.Router();
var crypt = require("bcrypt");
var db = require("../connection");
var bodyParser = require("body-parser");
const passport = require("passport");
var jsonParser = bodyParser.json();

var saltRounds = 7;

/* GET users listing. */
router.get("/", checkAuth, function (req, res, next) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.send(req.user());
});

/* GET users listing. */
router.get("/fail", function (req, res, next) {
  res.send("falha");
});

router.get("/success", function (req, res, next) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  console.log(req.user());
  return res.send({
    user: {
      fullName: req.user()[0].fullName,
      permission: req.user()[0].permission,
    },
    status: "success",
  });
});

router.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/users/fail",
   // successRedirect: '/users/success'
  }),
  function (req, res) {
    res.send({
      status: "success",
      user: req.user,
    });
  }
);

router.post("/", jsonParser, function (req, res, next) {
  console.log("Users Post", req.body);

  if (req.body.password == req.body.repeatPassword) {
    crypt.hash(req.body.password, saltRounds, function (err, hash) {
      console.log("Hash created", hash)
      var sql =
        "INSERT INTO Users (username,password,permission, fullname) VALUES (?,?,?,?)";
      var values = [
        req.body.userName,
        hash,
        req.body.permission,
        req.body.name,
      ];

      db.query(sql, values, function (err, result) {
        if (err) {
          res.status(400).send({
            SqlError: err,
            Status: 400,
          });
        } else {
          console.log("1 record inserted");
          res.status(200).send({
            SqlError: null,
            Status: 400,
            message: "Usuário Inserido com Sucesso",
          });
        }
      });
    });
  } else {
    res.status(400).send({
      SqlError: {
        errno: 1162,
      },
      Status: 400,
    });
  }
});

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.send({
    status: "not authenticated",
  });
}

module.exports = router;
