import { Router } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { auth, requireRole } from '../middleware/auth.js';
import Order from '../models/Order.js';
import OrderStatus from '../models/OrderStatus.js';

const router = Router();

router.post(
  '/create-payment',
  auth,
  requireRole('student','admin'),
  [
    body('order_amount').isNumeric(),
    body('student_info').isObject(),
    body('student_info.name').notEmpty(),
    body('student_info.id').notEmpty(),
    body('student_info.phone').isString().optional({ nullable: true }),
    body('student_info.email').isEmail().optional({ nullable: true }),
    body('school_id').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { order_amount, student_info, school_id } = req.body;

    const missing = [];
    const FAKE = String(process.env.DEV_FAKE_GATEWAY||'').toLowerCase()==='true';
    if (!FAKE) {
      if (!process.env.PAYMENT_API_BASE || process.env.PAYMENT_API_BASE.includes('<PUT_')) missing.push('PAYMENT_API_BASE');
      if (!process.env.PAYMENT_API_KEY) missing.push('PAYMENT_API_KEY');
      if (!process.env.PAYMENT_PG_KEY) missing.push('PAYMENT_PG_KEY');
    }
    if (!process.env.APP_BASE_URL) missing.push('APP_BASE_URL');
    if (missing.length) {
      return res.status(500).json({
        message: 'Server misconfiguration: missing env vars',
        missing
      });
    }

    const custom_order_id = `ORD-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
    const order = await Order.create({ school_id, student_info, custom_order_id, order_amount, gateway_name: 'EDV' });

    const payload = {
      pg_key: process.env.PAYMENT_PG_KEY,
      orderAmount: order_amount,
      customOrderId: custom_order_id,
      schoolId: process.env.SCHOOL_ID || school_id,
      customer: {
        name: student_info.name,
        id: student_info.id,
        email: student_info.email || 'na@example.com'
      },
      redirectUrl: `${process.env.APP_BASE_URL}/status/${custom_order_id}`
    };

    if (FAKE) {
      const autoCapture = String(process.env.DEV_AUTO_CAPTURE||'').toLowerCase()==='true'
      if (autoCapture){
        await OrderStatus.findOneAndUpdate(
          { collect_id: order._id },
          {
            order_amount,
            transaction_amount: order_amount,
            payment_mode: 'test',
            bank_reference: `FAKE-${order._id}`,
            payment_message: 'captured',
            status: 'success',
            payment_time: new Date(),
            gateway: 'FAKE'
          },
          { upsert: true }
        )
      }else{
        await OrderStatus.findOneAndUpdate(
          { collect_id: order._id },
          { order_amount, status: 'initiated', gateway: 'FAKE', payment_time: new Date() },
          { upsert: true }
        )
      }
      return res.json({
        custom_order_id,
        order_id: order._id,
        status: autoCapture? 'success' : 'initiated',
        payment_page: autoCapture? null : `${process.env.APP_BASE_URL}/status/${custom_order_id}?fake=1`,
        status_url: `${process.env.APP_BASE_URL}/status/${custom_order_id}`,
        raw: { fake: true, autoCapture }
      });
    }

    try {
      const amountStr = String(order_amount)
      const callback_url = `${process.env.APP_BASE_URL}/status/${custom_order_id}`
      const sign = jwt.sign({ school_id: process.env.SCHOOL_ID || school_id, amount: amountStr, callback_url }, process.env.PAYMENT_PG_KEY)
      const url = `${process.env.PAYMENT_API_BASE.replace(/\/$/, '')}/create-collect-request`
      const resp = await axios.post(url,
        { school_id: process.env.SCHOOL_ID || school_id, amount: amountStr, callback_url, sign },
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PAYMENT_API_KEY}` } }
      )

      await OrderStatus.create({
        collect_id: order._id,
        order_amount,
        status: 'initiated',
        gateway: 'EDV',
        external_collect_request_id: resp.data?.collect_request_id || resp.data?.collect_requestId || null
      });

      return res.json({
        custom_order_id,
        order_id: order._id,
        payment_page: resp.data?.Collect_request_url || resp.data?.collect_request_url || resp.data?.payment_url || null,
        collect_request_id: resp.data?.collect_request_id || resp.data?.collect_requestId || null,
        raw: resp.data
      })
    } catch (e) {
      const details = {
        status: e?.response?.status,
        data: e?.response?.data,
        message: e?.message
      };
      return res.status(502).json({ message: 'Payment API error', error: details });
    }
  }
);

export default router;

router.get('/check/:collect_request_id', auth, requireRole('admin'), async (req, res) => {
  try{
    const collect_request_id = req.params.collect_request_id
    const school_id = process.env.SCHOOL_ID || req.query.school_id
    if (!school_id) return res.status(400).json({ message:'school_id missing' })

    const statusDoc = await OrderStatus.findOne({ external_collect_request_id: collect_request_id })
    let order
    if (statusDoc) order = await Order.findById(statusDoc.collect_id)

    const sign = jwt.sign({ school_id, collect_request_id }, process.env.PAYMENT_PG_KEY)
    const url = `${process.env.PAYMENT_API_BASE.replace(/\/$/, '')}/collect-request/${encodeURIComponent(collect_request_id)}?school_id=${encodeURIComponent(school_id)}&sign=${encodeURIComponent(sign)}`

    const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${process.env.PAYMENT_API_KEY}` } })
    const status = (data?.status || '').toLowerCase() || 'pending'
    const payment_time = new Date()
    const update = {
      status,
      transaction_amount: data?.amount ?? (status==='success'? (order?.order_amount||null) : null),
      payment_mode: data?.details?.payment_methods || 'na',
      payment_time,
      gateway: 'EDV',
      external_collect_request_id: collect_request_id
    }

    if (order) {
      await OrderStatus.findOneAndUpdate({ collect_id: order._id }, { $set: update }, { upsert: true })
    }

    res.json({ ok:true, data, updated: !!order })
  }catch(e){
    res.status(500).json({ ok:false, error: e?.response?.data || e.message })
  }
})

