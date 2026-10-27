import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { createTask, updateTask, setTaskStatus, listTasks, listScheduleTasks, getCalendarCounts, getTags, dayPlan, databasePath } from './store.ts';

const dir=dirname(fileURLToPath(import.meta.url));
const host='127.0.0.1';
const port=Number(process.env.MCP_TODO_PORT || 4178);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.ts':'text/javascript; charset=utf-8'};
const web=createServer(async(req,res)=>{
  try {
    if(req.method==='GET' && req.url?.startsWith('/api/')) {
      const u=new URL(req.url,'http://localhost'); let data;
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
  } catch(error) { sendJson(res,400,{error:error.message}); }
});
function sendJson(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function readBody(req){let text='';for await(const chunk of req)text+=chunk;if(text.length>100_000)throw new Error('Request body is too large.');try{return JSON.parse(text||'{}');}catch{throw new Error('Request body must contain valid JSON.');}}
web.listen(port,host,()=>console.error(`mcp-todo web: http://${host}:${port} (SQLite: ${databasePath})`));
process.on('SIGINT',()=>{web.close();process.exit(0);});
