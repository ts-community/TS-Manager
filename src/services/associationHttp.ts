import {createServer} from 'node:http'
import {createHash,timingSafeEqual} from 'node:crypto'
import type {Client} from 'discord.js'
import {editAssociation,AssociationIssue} from './associationOperations'
export function startAssociationHttp(client:Client) {
  const secret=process.env.INTERNAL_API_KEY
  if(!secret || !process.env.STAFF_MANAGER_PORT)return
  const hash=(s:string)=>createHash('sha256').update(s).digest()
  const server=createServer(async(req,res)=>{
    const send=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
    const path=req.url?.match(/^\/internal\/staff\/associations\/([0-9a-f]{24})$/)
    if(req.method!=='PATCH'||!path)return send(404,{error:'Operación no disponible.'})
    if(!timingSafeEqual(hash(secret),hash(String(req.headers['x-internal-key']||''))))return send(401,{error:'No autorizado.'})
    try {
      let raw=''
      for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>8192)throw new AssociationIssue(413,'Formulario demasiado grande.')}
      let body;try{body=JSON.parse(raw)}catch{throw new AssociationIssue(400,'Formulario no válido.')}
      send(200,await editAssociation(client,String(req.headers['x-discord-id']||''),path[1],body))
    } catch(e){send(e instanceof AssociationIssue?e.status:503,{error:e instanceof AssociationIssue?e.message:'Manager no pudo completar la operación.'})}
  })
  server.on('error',e=>console.error('Servicio local de asociaciones:',e.message))
  server.listen(Number(process.env.STAFF_MANAGER_PORT),'127.0.0.1')
}
