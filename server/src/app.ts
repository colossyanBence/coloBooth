import createError from 'http-errors';
import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import http from 'http';
import cors from 'cors';

dotenv.config({ path: path.join(__dirname, '../.env') });
import { handleError } from './helpers/error';
import httpLogger from './middlewares/httpLogger';
import router from './routes/index';

const app: express.Application = express();

app.use(httpLogger);
app.use(express.json({limit: '5mb'}));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors({ origin: '*' }));
const oneHour = 360000000;
app.use('/upload', express.static("upload", { maxAge: oneHour, cacheControl: true, immutable: true }));
app.use('/preview', express.static("static"));
app.use('/', router);

// catch 404 and forward to error handler
app.use((_req, _res, next) => {
  next(createError(404));
});

// error handler
const errorHandler: express.ErrorRequestHandler = (err, _req, res) => {
  handleError(err, res);
};
app.use(errorHandler);

const port = process.env.PORT || '8000';
app.set('port', port);

const server = http.createServer(app);

function onError(error: { syscall: string; code: string }) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      process.exit(1);
      break;
    case 'EADDRINUSE':
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr?.port}`;
  console.info(`Server is listening on ${bind}`);
}

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);
