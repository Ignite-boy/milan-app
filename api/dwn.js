import IORedis from 'ioredis'
let redis
function getRedis(){ if(!redis) redis = new IORedis(process.env.KV_URL_REDIS_URL); return redis }

export default async function handler(req,res){
  const r = getRedis()
  const { did, data } = req.body || {}
  if(!did) return res.status(400).json({error:'DID required'})

  if(req.method==='POST'){
    await r.lpush(`dwn:${did}`, JSON.stringify({...data, ts: Date.now()}))
    return res.json({success:true})
  }
  if(req.method==='GET'){
    const didQ = req.query.did
    const records = await r.lrange(`dwn:${didQ}`,0,100)
    return res.json({records: records.map(x=>JSON.parse(x))})
  }
}
