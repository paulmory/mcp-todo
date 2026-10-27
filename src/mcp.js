import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { createTask, updateTask, setTaskStatus, listTasks, getTags, deleteTag, dayPlan } from './store.js';

const mcp = new McpServer({ name: 'mcp-todo', version: '0.1.0' });
const priority=z.enum(['low','normal','high']).describe('Task priority: low, normal, or high');
const status=z.enum(['open','done','deferred']).describe('Task status: open, done, or deferred');
const statusFilter=z.enum(['open','done','deferred','all']).describe('Status filter: open, deferred, done, or all');
const optionalDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Date in YYYY-MM-DD format');
const optionalTime=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe('Execution time in 24-hour HH:MM format');
function register(name,description,schema,fn) {
  mcp.registerTool(name,{description,inputSchema:z.object(schema)},async args=>{
    try { const result=await fn(args); return {content:[{type:'text',text:JSON.stringify(result,null,2)}]}; }
    catch(error) { return {isError:true,content:[{type:'text',text:error.message}]}; }
  });
}
register('create_task','Create a task. Tags are created automatically when needed.',{
  title:z.string().min(1).describe('Task title'),tags:z.array(z.string().min(1).max(100)).optional().describe('Tags to assign to the task; new tags are created automatically'),description:z.string().optional().describe('Task description'),dueDate:optionalDate,dueTime:optionalTime,priority:priority.optional()
},createTask);
register('list_tasks','List tasks. Defaults to open tasks; set status=done to include completed tasks.',{
  tags:z.array(z.string().min(1).max(100)).optional().describe('Return tasks that have all of these tags'),status:statusFilter.optional(),dueDate:optionalDate,overdue:z.boolean().optional(),priority:priority.optional()
},listTasks);
register('get_tags','List available task tags. Set withCounts=true to include open-task counts.',{withCounts:z.boolean().optional()},({withCounts})=>getTags(withCounts));
register('delete_tag','Delete a tag only when it is not assigned to any task. Fails with the usage count if the tag is in use.',{name:z.string().trim().min(1).max(100).describe('Tag name to delete')},({name})=>deleteTag(name));
register('update_task','Update a task by its stable ID.',{
  id:z.string().uuid().describe('Stable task ID'),title:z.string().min(1).optional(),tags:z.array(z.string().min(1).max(100)).optional().describe('Replace assigned tags; provide an empty array to clear them'),description:z.string().nullable().optional(),dueDate:optionalDate,dueTime:optionalTime,priority:priority.optional()
},({id,...changes})=>updateTask(id,changes));
register('update_task_status','Complete or defer a task by its stable ID, or reopen it.',{id:z.string().uuid(),status},({id,status})=>setTaskStatus(id,status));
register('get_day_plan','Build a suggested plan from open tasks: overdue tasks, tasks due on the selected date, then undated tasks by priority. This does not modify data.',{
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Selected date in YYYY-MM-DD format'),limit:z.number().int().min(1).max(100).optional().describe('Maximum number of tasks (default: 8)')
},({date,limit})=>dayPlan(date,limit ?? 8));

const transport = new StdioServerTransport();
await mcp.connect(transport);
