import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { createTask, updateTask, setTaskStatus, listTasks, getStructure, getTags, dayPlan, databasePath } from './store.js';

const dir=dirname(fileURLToPath(import.meta.url));
const host='127.0.0.1';
const port=Number(process.env.MCP_TODO_PORT || 4178);
const webEnabled=process.env.MCP_TODO_WEB !== '0';
let mcp;
if (process.env.MCP_TODO_MCP !== '0') {
const priority=z.enum(['low','normal','high']).describe('Task priority: low, normal, or high');
const status=z.enum(['open','done','deferred']).describe('Task status: open, done, or deferred');
const statusFilter=z.enum(['open','done','deferred','all']).describe('Status filter: open, deferred, done, or all');
const optionalDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Date in YYYY-MM-DD format');
mcp=new McpServer({name:'mcp-todo',version:'0.1.0'});
function register(name,description,schema,fn) {
  mcp.registerTool(name,{description,inputSchema:z.object(schema)},async args=>{
    try { const result=await fn(args); return {content:[{type:'text',text:JSON.stringify(result,null,2)}]}; }
    catch(error) { return {isError:true,content:[{type:'text',text:error.message}]}; }
  });
}
register('create_task','Create a task. Tags are created automatically when needed. Legacy project and section fields remain supported.',{
  title:z.string().min(1).describe('Task title'),tags:z.array(z.string().min(1).max(100)).optional().describe('Tags to assign to the task; new tags are created automatically'),project:z.string().optional().describe('Legacy project name; treated as a tag'),section:z.string().optional().describe('Legacy section name; treated as a tag'),description:z.string().optional().describe('Task description'),dueDate:optionalDate,priority:priority.optional()
},createTask);
register('list_tasks','List tasks. Defaults to open tasks; set status=done to include completed tasks.',{
  tags:z.array(z.string().min(1).max(100)).optional().describe('Return tasks that have all of these tags'),project:z.string().optional(),section:z.string().optional(),status:statusFilter.optional(),dueDate:optionalDate,overdue:z.boolean().optional(),priority:priority.optional()
},listTasks);
register('get_tags','List available task tags. Set withCounts=true to include open-task counts.',{withCounts:z.boolean().optional()},({withCounts})=>getTags(withCounts));
register('get_project_structure','Legacy compatibility: list projects and sections. Set withCounts=true to include open-task counts.',{withCounts:z.boolean().optional()},({withCounts})=>getStructure(withCounts));
register('update_task','Update a task by its stable ID.',{
  id:z.string().uuid().describe('Stable task ID'),title:z.string().min(1).optional(),tags:z.array(z.string().min(1).max(100)).optional().describe('Replace assigned tags; provide an empty array to clear them'),project:z.string().nullable().optional().describe('Legacy project field'),section:z.string().nullable().optional().describe('Legacy section field'),description:z.string().nullable().optional(),dueDate:optionalDate,priority:priority.optional()
},({id,...changes})=>updateTask(id,changes));
register('update_task_status','Complete or defer a task by its stable ID, or reopen it.',{id:z.string().uuid(),status},({id,status})=>setTaskStatus(id,status));
register('get_day_plan','Build a suggested plan from open tasks: overdue tasks, tasks due on the selected date, then undated tasks by priority. This does not modify data.',{
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Selected date in YYYY-MM-DD format'),limit:z.number().int().min(1).max(100).optional().describe('Maximum number of tasks (default: 8)')
},({date,limit})=>dayPlan(date,limit ?? 8));

}

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const web=createServer(async(req,res)=>{
  try {
    if(req.method==='GET' && req.url?.startsWith('/api/')) {
      const u=new URL(req.url,'http://localhost'); let data;
      if(u.pathname==='/api/tasks') { const filters=Object.fromEntries(u.searchParams); if(u.searchParams.has('tags')) filters.tags=u.searchParams.getAll('tags'); data=listTasks(filters); }
      else if(u.pathname==='/api/structure') data=getStructure(u.searchParams.get('withCounts')==='true');
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
if(webEnabled) web.listen(port,host,()=>console.error(`mcp-todo web: http://${host}:${port} (SQLite: ${databasePath})`));
const transport=new StdioServerTransport();
if (process.env.MCP_TODO_MCP !== '0') await mcp.connect(transport);
process.on('SIGINT',()=>{if(webEnabled)web.close();process.exit(0);});
