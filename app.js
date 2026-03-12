var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors')
var passport = require('passport');
var db = require('./connection');
var session = require('express-session');
const MemoryStore = require('memorystore')(session)
//var MySQLStore = require('express-mysql-session')(session);
const { auth } = require('express-oauth2-jwt-bearer');



var app = express();
app.use("/uploads", express.static("uploads"));
const jwtCheck = auth({
  audience: 'https://frc-awards.api',
  issuerBaseURL: 'https://dev-ul3tax4j6cs1npiy.us.auth0.com',
  tokenSigningAlg: 'RS256'
});


var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var teamsRouter = require('./routes/teams');
var awardsRouter = require('./routes/awards');
var orderRouter = require('./routes/order');
var eventsRouter = require('./routes/events')
var judgesRouter = require('./routes/judges')


//require('dotenv').config()


const initializePassport = require('./passport-config');
initializePassport(passport);




// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(cors({
  origin: ["https://frc-awards-front.vercel.app", "http://localhost:8081", "http://localhost:8080"],
  methods: ["POST", "PUT", "GET", "OPTIONS", "HEAD", "DELETE"],
  credentials: true,
}));

app.use(session({
  secret: 'Super Secret (change it)',
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  resave: true,
  saveUninitialized: false,
  cookie: {
    sameSite: 'lax', // must be 'none' to enable cross-site delivery
    secure: false,
  } // must be true if sameSite='none'
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.auth) {
    req.user = req.auth.payload || req.auth; // depende da versão
  }
  next();
});

app.use('/api',jwtCheck);


app.use('/', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/awards', awardsRouter);
app.use('/api/order', orderRouter);
app.use('/api/events', eventsRouter);
app.use('/api/judges', judgesRouter);


// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;