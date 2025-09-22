import mongoose from 'mongoose'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Order from '../models/Order.js'
import OrderStatus from '../models/OrderStatus.js'
import School from '../models/School.js'

dotenv.config()

async function run(){
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'school_payments' })
  console.log('Connected')

  const email='admin@example.com'
  const exists = await User.findOne({ email })
  if (!exists){
    await User.create({ email, name:'Admin', role:'admin', password: await bcrypt.hash('secret123',10) })
    console.log('Created default admin admin@example.com / secret123')
  }

  const schoolId = process.env.SCHOOL_ID || '65b0e6293e9f76a9694d84b4'
  const count = Number(process.env.SEED_COUNT || 15)
  const base = Date.now()
  const orders = []
  for (let i=0;i<count;i++){
    const custom_order_id = `ORD-${base - i*10000}`
    const ord = await Order.create({
      school_id: i%2===0? schoolId : 'SCHOOL-ALT',
      student_info: { name:`Student ${i}`, id:`SID${1000+i}`, email:`s${i}@demo.com` },
      gateway_name: 'EDV',
      order_amount: 5000 + i*100,
      custom_order_id
    })
    const statuses=['pending','success','failed']
    const st = statuses[i%3]
    await OrderStatus.create({
      collect_id: ord._id,
      order_amount: ord.order_amount,
      transaction_amount: st==='success'? ord.order_amount : null,
      status: st,
      payment_time: new Date(Date.now()-i*86400000),
      gateway: 'EDV',
      payment_mode: 'upi'
    })
    orders.push(ord)
  }

  const ids = await Order.distinct('school_id')
  let localMap = {}
  try { if (process.env.SCHOOLS_MAP_JSON) localMap = JSON.parse(process.env.SCHOOLS_MAP_JSON) } catch {}
  for (const id of ids){
    const friendly = localMap[id] || `Institute ${String(id).slice(-4).toUpperCase()}`
    await School.findOneAndUpdate(
      { school_id: id },
      { $set: { name: friendly } },
      { upsert: true }
    )
  }

  console.log(`Seeded ${orders.length} orders`)
  await mongoose.disconnect()
  console.log('Done')
}

run().catch(e=>{ console.error(e); process.exit(1) })
