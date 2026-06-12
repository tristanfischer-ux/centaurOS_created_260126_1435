#!/usr/bin/env node
// supplier-contacts.mjs — research the right CONTACT per roster supplier using a
// CHEAP web-grounded LLM (Gemini Flash via OpenRouter — NOT Claude), and parse
// results into forge-truth.db + SUPPLIER-CONTACTS.md.
//
// Tristan 2026-06-09: use Gemini Flash/Flash-Lite via OpenRouter (already funded),
// not Claude sub-agents. Web-grounded (:online) so contacts aren't hallucinated.
//
// Modes:
//   node scripts/supplier-contacts.mjs research        # Gemini :online for reach>=2 suppliers not yet done; appends raw blocks
//   node scripts/supplier-contacts.mjs parse           # read SUPPLIER-CONTACTS-raw.txt -> DB + SUPPLIER-CONTACTS.md
import Database from 'better-sqlite3'
import fs from 'fs'

const DB_PATH = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const RAW = 'SUPPLIER-CONTACTS-raw.txt'
const MD = 'SUPPLIER-CONTACTS.md'
const MODEL = 'google/gemini-3.5-flash:online'   // web-grounded cheap model
const DONE = new Set(['sulzer','koch-glitsch','koch glitsch','howden','prysmian','abb','grundfos','siemens','eaton','schneider electric','alfa laval','drager','dräger'])

function key(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() }

function loadKey(){
  const m = fs.readFileSync('.env.local','utf8').match(/^OPENROUTER_API_KEY=(.+)$/m)
  if(!m) throw new Error('no OPENROUTER_API_KEY'); return m[1].trim().replace(/^["']|["']$/g,'')
}

function promptFor(sup, scope, arches){
  return `You are a B2B sourcing researcher. Find the RIGHT PERSON for Tristan Fischer (founder, Fractional Forge — a UK deep-tech engineering & commercialisation advisory that builds engineering dossiers for hardware startups, then sources suppliers and runs RFQs) to contact at ${sup} to open a sourcing / quotation conversation.

Scope we would source from them: ${scope}.
Relevant archetypes: ${arches}. Buyer is UK-based; prefer a UK / UK&Ireland contact. Ideal = sales / business-development / key-account / application-engineering manager for the relevant division (NOT generic HQ press/marketing). If this is a commodity electronic-component maker normally bought via distributors (RS, Mouser, DigiKey, Farnell), say so and give the regional account/sales route.

USE WEB SEARCH. Ground every factual claim in a real retrieved source.
ANTI-FABRICATION (critical — a wrong contact is worse than none):
- NEVER invent a person's name or email. A named person is valid ONLY if found in a real cited source.
- EMAIL_TYPE is exactly one of: verified (exact email published — cite) | pattern-inferred (constructed from the company's KNOWN pattern — state the pattern AND the real published example) | enquiry-fallback (official sales/enquiry email or contact-form URL).
- If no named person is verifiable, set CONTACT_NAME to "none verified" and give the best enquiry route. That is success.
- CONFIDENCE honest: high / medium / low.

Return ONLY this block, exactly:
<<<
SUPPLIER: ${sup}
DIVISION: <division for our scope>
OFFICIAL_SITE: <verified https url>
UK_PRESENCE: <UK office/distributor + url, or "none found">
CONTACT_NAME: <full name | none verified>
POSITION: <title | ->
EMAIL: <email | enquiry url>
EMAIL_TYPE: <verified | pattern-inferred | enquiry-fallback>
EMAIL_BASIS: <source url, or "pattern + example url">
LINKEDIN: <url | none>
PHONE: <number | ->
SOURCES: <url1; url2; url3>
CONFIDENCE: <high | medium | low>
NOTES: <1-2 lines: best first move; direct vs distributor; caveats>
>>>`
}

async function callGemini(key, prompt){
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: MODEL, messages:[{role:'user',content:prompt}], max_tokens: 1800, temperature: 0.2 })
  })
  if(!res.ok){ const t=await res.text(); throw new Error(`OpenRouter ${res.status}: ${t.slice(0,200)}`) }
  const j = await res.json()
  return j.choices?.[0]?.message?.content || ''
}

async function research(){
  const apiKey = loadKey()
  const db = new Database(DB_PATH, { readonly:true })
  const rows = db.prepare(`SELECT n.supplier_name, COUNT(DISTINCT n.archetype) reach, GROUP_CONCAT(DISTINCT n.archetype) arches,
    (SELECT group_concat(value,', ') FROM (SELECT DISTINCT je.value FROM project_supplier_needs p2, json_each(p2.parts_json) je WHERE p2.company_id=n.company_id LIMIT 6)) scope
    FROM project_supplier_needs n GROUP BY n.company_id HAVING reach>=2 ORDER BY reach DESC, supplier_name`).all()
  db.close()
  const todo = rows.filter(r => !DONE.has(key(r.supplier_name)))
  console.log(`research: ${todo.length} suppliers via ${MODEL}`)
  let done=0
  const pool=4
  for(let i=0;i<todo.length;i+=pool){
    const batch=todo.slice(i,i+pool)
    const results = await Promise.allSettled(batch.map(async r=>{
      const out = await callGemini(apiKey, promptFor(r.supplier_name, r.scope||'(general components)', r.arches))
      const m = out.match(/<<<[\s\S]*?>>>/)
      const block = m? m[0] : `<<<\nSUPPLIER: ${r.supplier_name}\nCONTACT_NAME: none verified\nEMAIL_TYPE: enquiry-fallback\nCONFIDENCE: low\nNOTES: model returned no parseable block\nRAW: ${out.slice(0,300)}\n>>>`
      return block
    }))
    for(const x of results){ if(x.status==='fulfilled'){ fs.appendFileSync(RAW, '\n'+x.value+'\n'); done++ } else { console.error('  fail:', x.reason?.message?.slice(0,120)) } }
    console.log(`  ${Math.min(i+pool,todo.length)}/${todo.length}`)
  }
  console.log(`research done: ${done} blocks appended to ${RAW}`)
}

function parseBlocks(text){
  const blocks=[]
  for(const m of text.matchAll(/<<<([\s\S]*?)>>>/g)){
    const b={}; for(const line of m[1].trim().split('\n')){ const kv=line.match(/^([A-Z_]+):\s*(.*)$/); if(kv) b[kv[1]]=kv[2].trim() }
    if(b.SUPPLIER) blocks.push(b)
  }
  return blocks
}

function parse(){
  const text = fs.readFileSync(RAW,'utf8')
  const blocks = parseBlocks(text)
  // dedup by supplier (last wins)
  const bySup = new Map(); for(const b of blocks) bySup.set(key(b.SUPPLIER), b)
  const all=[...bySup.values()]
  const db = new Database(DB_PATH)
  db.pragma('busy_timeout=8000')
  // ensure contacts_json column exists BEFORE preparing any statement that references it
  try{ db.exec('ALTER TABLE companies ADD COLUMN contacts_json TEXT') }catch{}
  const find = db.prepare('SELECT company_id, supplier_name FROM project_supplier_needs GROUP BY company_id')
  const idByName = new Map(); for(const r of find.all()) idByName.set(key(r.supplier_name), r.company_id)
  const upd = db.prepare('UPDATE companies SET contact_name=@cn, contact_title=@ct, contact_email=@ce, contacts_json=@cj, updated_at=@now WHERE id=@id')
  const now=new Date().toISOString()
  let wrote=0
  for(const b of all){
    const id = idByName.get(key(b.SUPPLIER)); if(!id) continue
    const cn = (b.CONTACT_NAME && !/^none/i.test(b.CONTACT_NAME))? b.CONTACT_NAME : null
    upd.run({ id, cn, ct: b.POSITION||null, ce: b.EMAIL||null, cj: JSON.stringify(b), now })
    wrote++
  }
  db.close()
  // markdown
  const order={high:0,medium:1,low:2}
  all.sort((a,b)=> (order[(a.CONFIDENCE||'low').toLowerCase()]??3)-(order[(b.CONFIDENCE||'low').toLowerCase()]??3) || String(a.SUPPLIER).localeCompare(b.SUPPLIER))
  const L=[]
  L.push('# Supplier contacts — who to speak to')
  L.push('')
  L.push('Web-grounded research (Gemini Flash via OpenRouter + Sonnet for the first 11). Every email is tagged **verified** (published), **pattern-inferred** (built from the firm\'s known pattern — confirm before relying), or **enquiry-fallback** (official desk/form). Confirm pattern-inferred emails before sending anything sensitive.')
  L.push('')
  L.push('| Conf | Supplier | Contact | Position | Email | Email type | Phone |')
  L.push('|---|---|---|---|---|---|---|')
  for(const b of all){
    L.push(`| ${b.CONFIDENCE||'?'} | ${b.SUPPLIER} | ${b.CONTACT_NAME||'-'} | ${(b.POSITION||'-').slice(0,40)} | ${b.EMAIL||'-'} | ${b.EMAIL_TYPE||'-'} | ${b.PHONE||'-'} |`)
  }
  L.push('')
  L.push('## Detail')
  for(const b of all){
    L.push(`### ${b.SUPPLIER}  _(confidence: ${b.CONFIDENCE||'?'})_`)
    L.push(`- **Division:** ${b.DIVISION||'-'}`)
    L.push(`- **Contact:** ${b.CONTACT_NAME||'none verified'} — ${b.POSITION||'-'}`)
    L.push(`- **Email:** ${b.EMAIL||'-'}  _(${b.EMAIL_TYPE||'-'})_ — ${b.EMAIL_BASIS||''}`)
    if(b.LINKEDIN && b.LINKEDIN!=='none') L.push(`- **LinkedIn:** ${b.LINKEDIN}`)
    L.push(`- **Phone:** ${b.PHONE||'-'} · **UK:** ${b.UK_PRESENCE||'-'}`)
    L.push(`- **Notes:** ${b.NOTES||''}`)
    L.push(`- **Sources:** ${b.SOURCES||''}`)
    L.push('')
  }
  fs.writeFileSync(MD, L.join('\n'))
  console.log(`parse: ${all.length} suppliers -> ${MD}; wrote ${wrote} to companies (contact fields + contacts_json)`)
}

const mode = process.argv[2]||'parse'
if(mode==='research') await research()
else parse()
