import { Router } from 'express';
import Order from '../models/Order.js';
import OrderStatus from '../models/OrderStatus.js';
import WebhookLog from '../models/WebhookLog.js';

const router = Router();

router.post('/', async (req, res) => {
  await WebhookLog.create({ headers: req.headers, body: req.body, handled: false });
  const data = req.body?.order_info || {};
  try {
    const order = await Order.findOne({ $or: [{ _id: data.order_id }, { custom_order_id: data.order_id }] });
    if (!order) return res.status(200).json({ ok: true }); 
    await OrderStatus.findOneAndUpdate(
      { collect_id: order._id },
      {
        order_amount: data.order_amount,
        transaction_amount: data.transaction_amount,
        payment_mode: data.payment_mode,
        payment_details: data.payemnt_details || data.payment_details,
        bank_reference: data.bank_reference,
        payment_message: data.Payment_message || data.payment_message,
        status: data.status,
        error_message: data.error_message,
        payment_time: data.payment_time ? new Date(data.payment_time) : new Date(),
        gateway: data.gateway
      },
      { upsert: true }
    );

    await WebhookLog.updateMany({ 'body.order_info.order_id': data.order_id }, { $set: { handled: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
