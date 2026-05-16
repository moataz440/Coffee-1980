import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVercel = process.env.VERCEL === '1';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
});

// Build transports list — always include console
const loggerTransports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat)
  }),
];

const exceptionHandlers = [];
const rejectionHandlers = [];

// File transports only when NOT on Vercel (filesystem is read-only there)
if (!isVercel) {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    mkdirSync(logsDir, { recursive: true });

    loggerTransports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'access.log'),
        level: 'http',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
      })
    );

    exceptionHandlers.push(
      new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log') })
    );

    rejectionHandlers.push(
      new winston.transports.File({ filename: path.join(logsDir, 'rejections.log') })
    );
  } catch (e) {
    console.warn('[logger] Could not create log directory, file logging disabled:', e.message);
  }
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: loggerTransports,
  ...(exceptionHandlers.length && { exceptionHandlers }),
  ...(rejectionHandlers.length && { rejectionHandlers }),
});
