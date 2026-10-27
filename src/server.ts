import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { createTask, updateTask, setTaskStatus, listTasks, listScheduleTasks, getCalendarCounts, dayPlan, getTags } from './entities/task/index.ts';
import { createWebSession, revokeWebSession, userIdForSession, userIdForToken } from './shared/auth/repository.ts';
import { LOCAL_USER_ID, withUser } from './shared/auth/user-context.ts';
import { databasePath, db } from './shared/db/index.ts';

const dir=dirname(fileURLToPath(import.meta.url));
const host=process.env.MCP_TODO_HOST || '127.0.0.1';
const port=Number(process.env.MCP_TODO_PORT || 4178);
const configuredToken=process.env.MCP_TODO_TOKEN;
const configuredUserId=configuredToken ? userIdForToken(configuredToken) : null;
if(configuredToken && !configuredUserId) throw new Error('MCP_TODO_TOKEN is invalid or revoked.');
const sessionCookie='mcp_todo_session';
const localHost=['127.0.0.1','::1','localhost'].includes(host);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.ts':'text/javascript; charset=utf-8'};
const web=createServer(async(req,res)=>{
  try {
    const requestUrl=new URL(req.url || '/', 'http://localhost');
    const session=getCookie(req,sessionCookie);
    if(req.method==='POST' && requestUrl.pathname==='/api/auth') {
      const body=await readBody(req);
      const auth=createWebSession(String(body.token || ''));
      if(!auth) return sendJson(res,401,{error:'Invalid access token.'});
      const secure=process.env.MCP_TODO_COOKIE_SECURE==='true' ? '; Secure' : '';
      res.setHeader('set-cookie',`${sessionCookie}=${auth.session}; HttpOnly; SameSite=Strict; Path=/; Expires=${new Date(auth.expiresAt).toUTCString()}${secure}`);
      return sendJson(res,200,{authenticated:true,code:(dbUserCode(auth.userId))});
    }
    if(req.method==='POST' && requestUrl.pathname==='/api/auth/logout') {
      if(session) revokeWebSession(session);
      res.setHeader('set-cookie',`${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      return sendJson(res,200,{authenticated:false});
    }
    const sessionUser=session ? userIdForSession(session) : null;
    if(req.method==='GET' && requestUrl.pathname==='/api/auth') {
      const userId=sessionUser || configuredUserId || (localHost ? LOCAL_USER_ID : null);
      if (!userId) return sendJson(res,200,{authenticated:false,local:false,code:null});
      return sendJson(res,200,{authenticated:Boolean(sessionUser || configuredUserId),local:!sessionUser && !configuredUserId,code:dbUserCode(userId)});
    }
    if(req.method==='GET' && !requestUrl.pathname.startsWith('/api/')) {
      const path=requestUrl.pathname==='/'?'/index.html':requestUrl.pathname;
      const publicDir=resolve(dir,'..','dist');
      const file=resolve(publicDir,`.${path}`);
      if(file!==publicDir && !file.startsWith(publicDir+sep)) {res.writeHead(404);return res.end('Not found');}
      const content=await readFile(file); res.writeHead(200,{'content-type':mime[path.slice(path.lastIndexOf('.'))]||'application/octet-stream'}); return res.end(content);
    }
    const bearer=req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const bearerUser=bearer ? userIdForToken(bearer) : null;
    const userId=sessionUser || bearerUser || configuredUserId || (localHost ? LOCAL_USER_ID : null);
    if(!userId) return sendJson(res,401,{error:'Authentication required.'});
    return await withUser(userId, async()=>{
    if(req.method==='GET' && req.url?.startsWith('/api/')) {
      const u=requestUrl; let data;
      if(u.pathname==='/api/tasks') { const filters: Record<string, any>=Object.fromEntries(u.searchParams); if(u.searchParams.has('tags')) filters.tags=u.searchParams.getAll('tags'); if(u.searchParams.has('q')) filters.search=u.searchParams.get('q'); data=listTasks(filters); }
      else if(u.pathname==='/api/schedule') data=listScheduleTasks(u.searchParams.get('date'),u.searchParams.get('includeBacklog')==='true',Number(u.searchParams.get('limit')||100),Number(u.searchParams.get('offset')||0));
      else if(u.pathname==='/api/calendar-counts') data=getCalendarCounts(u.searchParams.get('from'),u.searchParams.get('to'));
      else if(u.pathname==='/api/tags') data=getTags(u.searchParams.get('withCounts')==='true');
      else if(u.pathname==='/api/plan') data=dayPlan(u.searchParams.get('date'),Number(u.searchParams.get('limit')||8));
      else {res.writeHead(404);return res.end('Not found');}
      return sendJson(res,200,data);
    }
    if(req.method==='POST' && req.url?.startsWith('/api/')) {
      const body=await readBody(req); let data;
      if(req.url==='/api/tasks') data=createTask(body);
      else if(req.url.startsWith('/api/tasks/')) {
        const parts=req.url.split('/'); const id=decodeURIComponent(parts[3]||'');
        if(parts[4]==='status') data=setTaskStatus(id,body.status); else data=updateTask(id,body);
      } else {res.writeHead(404);return res.end('Not found');}
      return sendJson(res,200,data);
    }
    if(req.method==='GET') {
      const path=req.url==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const publicDir=resolve(dir,'..','dist');
      const file=resolve(publicDir,`.${path}`);
      if(file!==publicDir && !file.startsWith(publicDir+sep)) {res.writeHead(404);return res.end('Not found');}
      const content=await readFile(file); res.writeHead(200,{'content-type':mime[path.slice(path.lastIndexOf('.'))]||'application/octet-stream'}); return res.end(content);
    }
    res.writeHead(405);res.end('Method not allowed');
    });
  } catch(error) { sendJson(res,400,{error:error.message}); }
});
function sendJson(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function readBody(req){let text='';for await(const chunk of req)text+=chunk;if(text.length>100_000)throw new Error('Request body is too large.');try{return JSON.parse(text||'{}');}catch{throw new Error('Request body must contain valid JSON.');}}
function getCookie(req,name){const value=req.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`));return value ? decodeURIComponent(value.slice(name.length+1)) : '';}
function dbUserCode(userId){return db.prepare('SELECT code FROM users WHERE id=?').get(userId)?.code || 'local';}
web.listen(port,host,()=>console.error(`mcp-todo web: http://${host}:${port} (SQLite: ${databasePath})`));
process.on('SIGINT',()=>{web.close();process.exit(0);});
