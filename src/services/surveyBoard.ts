import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export type Shift={localDay:string;weekday:number;primaryId:string|null;backupIds:string[];effectiveId:string|null;declined:string[];status:string;revision:number;noticeRevision:number;publication?:{authorId:string;messageId:string}}
export type Week={today:string;items:Shift[];members:{id:string;name:string;avatarUrl:string}[];templates:{weekday:number;revision:number;primaryId:string|null;backupIds:string[]}[];sync?:{url?:string}}
export const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
export const label:Record<string,string>={next:'Próx. semana',published:'Publicada',confirmed:'Confirmada',pending:'Pendiente',uncovered:'Sin cobertura',review:'En revisión',cancelled:'Suspendida'}
const asset=(file:string)=>fileURLToPath(new URL('../assets/surveys/'+file,import.meta.url))
const escape=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!))
// La imagen solo lleva Inter y Lilita: letras decorativas (𝘼, 𝕯…) pasan a normales y se quitan emojis y símbolos.
const plain=(s:string)=>s.normalize('NFKC').replace(/[^\p{L}\p{N}\p{P}\p{Zs}|+]/gu,'').replace(/\s{2,}/g,' ').trim()||s
const limit=(s:string,n:number)=>[...s].length>n?[...s].slice(0,n-1).join('')+'…':s
export const display=(week:Week,id:string|null)=>week.members.find(m=>m.id===id)?.name || id || 'Por asignar'
export const describe=(w:Week,s:Shift)=>weekdays[s.weekday-1]+' · '+display(w,s.primaryId)+' · Refuerzos: '+(s.backupIds.map(id=>display(w,id)).join(', ')||'Sin refuerzos')+' · '+(s.publication?'Publicada por '+display(w,s.publication.authorId):label[s.status])
/** Los días ya pasados muestran el reparto fijo de la semana siguiente, como el panel. */
export const boardView=(w:Week):Week=>({...w,items:w.items.map(s=>{
  const rule=s.localDay<w.today?w.templates.find(r=>r.weekday===s.weekday):undefined
  return rule?{...s,primaryId:rule.primaryId,backupIds:rule.backupIds,effectiveId:rule.primaryId,status:'next',publication:undefined}:s
})})
export const boardSignature=(week:Week)=>createHash('sha256').update(JSON.stringify([week.today,boardView(week).items.map(s=>[describe(boardView(week),s),s.effectiveId,week.members.find(m=>m.id===s.primaryId)?.avatarUrl])])).digest('hex')
const avatars=new Map<string,Buffer>()
async function avatar(url?:string) {
  if(!url || !url.startsWith('https://cdn.discordapp.com/')) return null
  if(avatars.has(url))return avatars.get(url)
  const res=await fetch(url,{signal:AbortSignal.timeout(2000)}).catch(()=>null)
  if(!res?.ok)return null
  const value=Buffer.from(await res.arrayBuffer())
  if(value.length>262144)return null
  if(avatars.size>=128)avatars.delete(avatars.keys().next().value!)
  avatars.set(url,value)
  return value
}
export async function renderBoard(week:Week) {
  const w=boardView(week)
  const height=370+Math.max(1,...w.items.map(s=>s.backupIds.length))*29, width=1400
  const text=(x:number,y:number,s:string,size:number,color='#e8edf0',font='Inter',anchor='middle')=>`<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" text-anchor="${anchor}" fill="${color}">${escape(s)}</text>`
  const img=(file:string,mime:string)=>'data:image/'+mime+';base64,'+readFileSync(asset(file)).toString('base64')
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0a0b10"/><image width="1400" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="${img('arena.jpg','jpeg')}"/><image x="28" y="15" width="52" height="52" xlink:href="${img('ts.png','png')}"/>`,
    text(98,54,'Agenda de encuestas',38,'#f3faf9','Lilita One','start'),text(1360,49,w.items[0].localDay+'   /   '+w.items.at(-1)!.localDay,19,'#a9c6c4','Inter','end')]
  const photos=await Promise.all(w.items.map(s=>avatar(w.members.find(m=>m.id===s.primaryId)?.avatarUrl)))
  w.items.forEach((s,i)=>{
    const x=18+i*195,cx=x+94, today=s.localDay===w.today, name=plain(display(w,s.primaryId))
    parts.push(`<rect x="${x}" y="88" width="188" height="${height-106}" rx="13" fill="#11151d" fill-opacity=".94" stroke="${today?'#2dd4bf':'#35414a'}"/>`,
      text(cx,129,weekdays[i],29,'#edf5f4','Lilita One'),`<circle cx="${cx}" cy="183" r="34" fill="#244044"/>`)
    if(photos[i])parts.push(`<clipPath id="avatar${i}"><circle cx="${cx}" cy="183" r="34"/></clipPath><image x="${cx-34}" y="149" width="68" height="68" clip-path="url(#avatar${i})" xlink:href="data:image/png;base64,${photos[i]!.toString('base64')}"/>`)
    else parts.push(text(cx,193,s.primaryId?name.slice(0,2).toLocaleUpperCase('es'):'—',26))
    parts.push(text(cx,248,limit(name,15),22), text(cx,276,(today?'Hoy · ':'')+(label[s.status]||''),15,s.status==='next'?'#8cc4ff':'#84e4d6'),
      `<path d="M${x+12} 296h164" stroke="#34454d"/>`,text(cx,325,'Refuerzos',18,'#8ba6ac'))
    const names=s.backupIds.map(id=>plain(display(w,id)))
    ;(names.length?names:['Sin refuerzos']).forEach((n,j)=>parts.push(text(cx,355+j*29,limit(n,18),17)))
  })
  parts.push('</svg>')
  return Buffer.from(new Resvg(parts.join(''),{font:{loadSystemFonts:false,fontFiles:[asset('lilita.ttf'),asset('inter.ttf')],defaultFontFamily:'Inter'}}).render().asPng())
}
