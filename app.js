const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

const app = express();
app.disable('etag');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));

// doubled slashes count as one: "/api//spots" works like "/api/spots" (only the path, not the query)
app.use((req, res, next) => {
  req.url = req.url.replace(/^[^?]*/, (urlPath) => urlPath.replace(/\/{2,}/g, '/'));
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api', apiRouter);

// errors in /api (e.g. broken JSON body) → JSON reply, not the HTML error page
app.use('/api', (err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
