import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import authRouter from './routes/auth.js';
import paymentRouter from './routes/payments.js';
import txnRouter from './routes/transactions.js';
import webhookRouter from './routes/webhook.js';
import { notFound, errorHandler } from './middleware/error.js';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => res.json({ ok: true, service: 'School Payments API' }));

app.use('/auth', authRouter);
app.use('/payments', paymentRouter);
app.use('/transactions', txnRouter);
app.use('/webhook', webhookRouter);

// Error handlers
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI, { dbName: 'school_payments' })
  .then(() => {
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Mongo connection error', e.message);
    process.exit(1);
  });
