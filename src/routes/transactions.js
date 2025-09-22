import { Router } from 'express';
import { query, param, validationResult } from 'express-validator';
import { auth, requireRole } from '../middleware/auth.js';
import Order from '../models/Order.js';
import School from '../models/School.js';

const router = Router();

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get(
  '/',
  auth,
  requireRole('admin'),
  [
    query('page')
      .customSanitizer((v) => {
        if (typeof v === 'string') v = v.trim();
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isInt({ min: 1 })
      .toInt(),
    query('limit')
      .customSanitizer((v) => {
        if (typeof v === 'string') v = v.trim();
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isInt({ min: 1, max: 100 })
      .toInt(),
    query('sort')
      .trim()
      .customSanitizer((v) => {
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isString(),
    query('order')
      .trim()
      .customSanitizer((v) => {
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return String(v).toLowerCase();
      })
      .optional({ checkFalsy: true, nullable: true })
      .isIn(['asc', 'desc']),
    query('status')
      .trim()
      .customSanitizer((v) => {
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isString(),
    query('schoolIds')
      .trim()
      .customSanitizer((v) => {
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isString(),
    query('from')
      .trim()
      .customSanitizer((v) => {
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isISO8601(),
    query('to')
      .trim()
      .customSanitizer((v) => {
        if (v === '' || v === null || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') return undefined;
        return v;
      })
      .optional({ checkFalsy: true, nullable: true })
      .isISO8601()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const matchStage = {};
    if (req.query.schoolIds) {
      const arr = req.query.schoolIds.split(',').filter(Boolean);
      if (arr.length) matchStage.school_id = { $in: arr };
    }

    
    let statusFilter = null;
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map(s=>s.trim()).filter(Boolean);
      if (statuses.length===1) statusFilter = { 'statusDoc.status': statuses[0] };
      if (statuses.length>1) statusFilter = { 'statusDoc.status': { $in: statuses } };
    }

    const pipeline = [
      Object.keys(matchStage).length ? { $match: matchStage } : null,
      { $lookup: { from: 'schools', localField: 'school_id', foreignField: 'school_id', as: 'schoolDoc' } },
      { $unwind: { path: '$schoolDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'orderstatuses', localField: '_id', foreignField: 'collect_id', as: 'statusDoc' } },
      { $unwind: { path: '$statusDoc', preserveNullAndEmptyArrays: true } },
      ...(statusFilter ? [{ $match: statusFilter }] : []),
      ...(req.query.from || req.query.to
        ? [
            {
              $match: {
                ...(req.query.from ? { 'statusDoc.payment_time': { $gte: new Date(req.query.from) } } : {}),
                ...(req.query.to ? { 'statusDoc.payment_time': { ...(req.query.from ? {} : {}), $lte: new Date(req.query.to) } } : {})
              }
            }
          ]
        : []),
      {
        $project: {
          collect_id: '$_id',
          school_id: 1,
          school_name: { $ifNull: ['$schoolDoc.name', '$school_id'] },
          gateway: { $ifNull: ['$statusDoc.gateway', '$gateway_name'] },
          order_amount: 1,
          transaction_amount: '$statusDoc.transaction_amount',
          status: '$statusDoc.status',
          custom_order_id: 1,
          payment_time: '$statusDoc.payment_time',
          createdAt: 1,
          payment_mode: '$statusDoc.payment_mode',
          student_name: '$student_info.name',
          student_id: '$student_info.id',
          phone: '$student_info.phone',
          vendor_amount: '$statusDoc.vendor_amount',
          capture_status: '$statusDoc.capture_status',
          external_collect_request_id: '$statusDoc.external_collect_request_id'
        }
      },
      { $sort: { [sortField]: sortOrder } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ].filter(Boolean);

    const [rawItems, total] = await Promise.all([
      Order.aggregate(pipeline),
      Order.countDocuments(matchStage)
    ]);

    let localMap = {};
    try {
      if (process.env.SCHOOLS_MAP_JSON) localMap = JSON.parse(process.env.SCHOOLS_MAP_JSON);
    } catch {}
    const items = rawItems.map(it => ({
      ...it,
      school_name: it.school_name && it.school_name !== it.school_id ? it.school_name : (localMap[it.school_id] || it.school_id)
    }));

    res.json({ page, limit, total, items });
  }
);

router.get('/schools', auth, requireRole('admin'), async (_req, res) => {
  const ids = await Order.distinct('school_id');
  const dbSchools = await School.find({ school_id: { $in: ids } }).lean();
  const byId = Object.fromEntries(dbSchools.map(s => [s.school_id, s.name]));
  let localMap = {};
  try { if (process.env.SCHOOLS_MAP_JSON) localMap = JSON.parse(process.env.SCHOOLS_MAP_JSON); } catch {}
  const items = ids.map(id => ({ school_id: id, name: byId[id] || localMap[id] || id }));
  res.json({ items });
});

router.get('/school/:schoolId', auth, requireRole('admin'), [param('schoolId').notEmpty()], async (req, res) => {
  const schoolId = (req.params.schoolId || '').trim();
  const safe = escapeRegex(schoolId);
  const pipeline = [
    { $match: { school_id: { $regex: safe, $options: 'i' } } },
    { $lookup: { from: 'orderstatuses', localField: '_id', foreignField: 'collect_id', as: 'statusDoc' } },
    { $unwind: { path: '$statusDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        collect_id: '$_id',
        school_id: 1,
        gateway: { $ifNull: ['$statusDoc.gateway', '$gateway_name'] },
        order_amount: 1,
        transaction_amount: '$statusDoc.transaction_amount',
        status: '$statusDoc.status',
        custom_order_id: 1,
        payment_time: '$statusDoc.payment_time',
        createdAt: 1,
        external_collect_request_id: '$statusDoc.external_collect_request_id'
      }
    }
  ];
  const items = await Order.aggregate(pipeline);
  res.json({ total: items.length, items });
});

router.get('/status/:custom_order_id', auth, async (req, res) => {
  const order = await Order.findOne({ custom_order_id: req.params.custom_order_id });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const agg = await Order.aggregate([
    { $match: { _id: order._id } },
    { $lookup: { from: 'orderstatuses', localField: '_id', foreignField: 'collect_id', as: 'statusDoc' } },
    { $unwind: { path: '$statusDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        collect_id: '$_id',
        school_id: 1,
        gateway: { $ifNull: ['$statusDoc.gateway', '$gateway_name'] },
        order_amount: 1,
        transaction_amount: '$statusDoc.transaction_amount',
        status: '$statusDoc.status',
        custom_order_id: 1,
        payment_time: '$statusDoc.payment_time'
      }
    }
  ]);
  res.json(agg[0] || {});
});

export default router;
