import { internalApiKey, tsApiUrl } from '../config/env'
import { staffChannels } from '../config/staffChannels'

export async function staffApi<T>(actor:string|null, path:string, body?:object, method=body?'POST':'GET'):Promise<T> {
  if (!internalApiKey) throw new Error('Falta INTERNAL_API_KEY.')
  const prefix=actor?'/api/panel/workspace/':'/api/internal/staff/'
  const res=await fetch(tsApiUrl.replace(/\/+$/,'')+prefix+path,{method,headers:{'Content-Type':'application/json',
    'x-internal-key':internalApiKey,'x-staff-guild':staffChannels.guild,...(actor?{'x-discord-id':actor}:{})},signal:AbortSignal.timeout(10000),
    ...(body?{body:JSON.stringify(body)}:{})})
  const result=await res.json() as T & {error?:string}
  if (!res.ok) throw new Error(result.error || 'Servicio de operaciones no disponible.')
  return result
}
