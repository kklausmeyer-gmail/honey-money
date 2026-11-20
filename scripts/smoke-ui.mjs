// Isolated browser smoke check: all Supabase requests are mocked with fabricated records.
// Usage: node scripts/smoke-ui.mjs ABSOLUTE_PLAYWRIGHT_PACKAGE_PATH
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(pathToFileURL(process.argv[2] + '/index.mjs'));
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('http://localhost/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    assert.ok(!relative.includes('..'));
    const contentType = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.png') ? 'image/png' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
    await route.fulfill({status:200,contentType,body:await readFile(new URL('../dist/'+relative,import.meta.url))});
  });
  const user = '11111111-1111-4111-8111-111111111111';
  const now = Math.floor(Date.now()/1000);
  const claims = { sub: user, role: 'authenticated', aal: 'aal2', exp: now+3600, iat: now, amr: [{method:'totp',timestamp:now}] };
  const token = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),Buffer.from('synthetic-signature').toString('base64url')].join('.');
  await context.addInitScript(({token,user,now}) => {
    if (!sessionStorage.getItem('honey-test-seeded')) {
      sessionStorage.setItem('honey-test-seeded','yes');
      sessionStorage.setItem('sb-yjqitkswyeehqwotrdhz-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:user,email:'synthetic@example.invalid',factors:[]}}));
    }
  },{token,user,now});
  let expenses = [{ id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',description:'Synthetic groceries',expense_date:'2000-01-01',amount_cents:1000,kirk_share_cents:500,paid_by:'kirk',category:'General',notes:'',tags:[],version:1 }];
  let history = [{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',description:'Synthetic history',expense_date:'2000-01-01',cost_cents:1000,kirk_delta_cents:200,jenny_delta_cents:-200,kind:'expense',category:'General',version:1}];
  let schedules = [{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',description:'Synthetic monthly',amount_cents:101,kirk_share_cents:50,paid_by:'kirk',frequency:'monthly',next_due:'2000-01-31',active:true,version:1}];
  const writes = [], errors = [];
  await context.route('https://*.supabase.co/**',async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
    let result;
    if(name==='logout') result={};
    else if(name==='token') result={access_token:token,refresh_token:'synthetic-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:user,email:'synthetic@example.invalid',factors:[]}};
    else if(name==='my_membership') result='kirk';
    else if(name==='household_access') result=true;
    else if(name==='expenses' && req.method()==='GET') result=expenses;
    else if(name==='splitwise_history') result=history;
    else if(name==='recurring_expenses') result=schedules;
    else if(req.method()==='POST' && name==='save_and_repeat_expense') {
      const body=req.postDataJSON(); writes.push({name,body});
      const source=body.p_source==='expenses'?expenses:history;
      if(body.p_id) {const row=source.find(r=>r.id===body.p_id); assert.equal(row.version,body.p_version); Object.assign(row,body.p_values); row.version++;}
      else source.push({id:body.p_new_id,...body.p_values,version:1});
      schedules.push({id:crypto.randomUUID(),...body.p_schedule,next_due:body.p_schedule.anchor_date,active:true,version:1,source_type:body.p_source,source_id:body.p_id||body.p_new_id});
      result=schedules.at(-1).id;
    }
    else if(req.method()==='POST' && name==='change_expense') {
      const body=req.postDataJSON(); writes.push({name,body});
      const row=(body.p_source==='expenses'?expenses:history).find(r=>r.id===body.p_id);
      assert.equal(body.p_version,row.version);
      if(body.p_action==='delete') row.deleted_at='2026-01-01';
      else Object.assign(row,body.p_values);
      row.version++; result=null;
    } else if(req.method()==='POST' && name==='save_recurring') {
      const body=req.postDataJSON(); writes.push({name,body});
      if(body.p_id) {const row=schedules.find(r=>r.id===body.p_id); Object.assign(row,body.p_values); row.version++;}
      else schedules.push({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',...body.p_values,next_due:body.p_values.anchor_date,active:true,version:1});
      result='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    } else if(req.method()==='POST' && name==='confirm_recurring') {
      const body=req.postDataJSON(); writes.push({name,body});
      const row=schedules.find(r=>r.id===body.p_id); assert.equal(body.p_version,row.version);
      if(!body.p_skip) expenses.push({id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',...row,description:'Synthetic confirmed',expense_date:row.next_due,category:'General',tags:[],notes:''});
      row.next_due='2000-02-29'; row.version++; result=null;
    } else throw new Error('Unexpected network request: '+req.method()+' '+url.pathname);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost/');
  try { await page.getByText('Hi, Kirk').waitFor({timeout:10000}); }
  catch(e) { console.log('Synthetic-page errors:',errors); console.log(await page.locator('body').innerText()); throw e; }
  await page.getByText('Kirk paid (assumed)',{exact:false}).waitFor();
  assert.equal(await page.locator('#todo-content').isVisible(),false);
  assert.ok(Number(await page.locator('#todo-count').textContent()) > 0);
  assert.equal(await page.getByText('Toward Kirk',{exact:false}).count(),0);
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(),1);
  for (const width of [320,375,390,430]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow at '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-edit="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]').scrollIntoViewIfNeeded();
  const beforeDialog=await page.evaluate(()=>scrollY);
  await page.locator('[data-edit="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]').click();
  assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
  assert.ok(await page.locator('dialog input').evaluateAll(inputs=>inputs.every(el=>parseFloat(getComputedStyle(el).fontSize)>=16)));
  assert.ok(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'dialog width');
  const lockedTop=await page.evaluate(()=>document.body.style.top);
  await page.locator('dialog').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.mouse.move(10,10); await page.mouse.wheel(0,800);
  assert.equal(await page.evaluate(()=>document.body.style.top),lockedTop);
  await page.locator('#close').click(); await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.body.style.position),'');
  assert.ok(Math.abs(await page.evaluate(()=>scrollY)-beforeDialog)<2,'restores scroll position');
  await page.locator('[data-edit="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]').click();
  assert.equal(await page.locator('[name="amount"]').inputValue(),'10.00');
  await page.locator('[name="amount"]').fill('12.00');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(expenses[0].amount_cents,1200);
  await page.locator('[data-edit="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]').click();
  await page.locator('[name="impact"]').fill('3.00');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(history[0].kirk_delta_cents,300);
  await page.locator('[data-delete="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]').click();
  await page.getByRole('button',{name:'Delete expense',exact:true}).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-edit="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]').count(),0);
  await page.locator('#todo-toggle').click();
  assert.equal(await page.locator('#todo-content').isVisible(),true);
  await page.locator('[data-confirm]').first().click();
  await page.locator('#recurring-action button').click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(writes.at(-1).body.p_skip,false);
  await page.locator('[data-skip]').first().click();
  await page.locator('#recurring-action button').click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(writes.at(-1).body.p_skip,true);
  await page.locator('[data-pause]').first().click();
  await page.locator('#recurring-action button').click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(schedules[0].active,false);
  await page.getByRole('button',{name:'+ Recurring expense',exact:true}).click();
  await page.locator('input[name="description"]').fill('Synthetic rent');
  await page.locator('[name="amount"]').fill('100.00');
  await page.getByRole('button',{name:'Create recurring reminder'}).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(schedules.length,2);
  await page.locator('[data-edit="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]').click();
  assert.equal(await page.locator('[name="repeat_frequency"]').isVisible(),false);
  await page.locator('[name="make_recurring"]').check();
  await page.locator('[name="repeat_frequency"]').selectOption('quarterly');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(writes.at(-1).name,'save_and_repeat_expense');
  assert.equal(writes.at(-1).body.p_schedule.frequency,'quarterly');
  assert.equal(writes.at(-1).body.p_values.kirk_delta_cents,300);
  assert.equal(schedules.length,3);
  await page.getByRole('button',{name:'+ Add an expense',exact:true}).click();
  await page.locator('input[name="description"]').fill('Synthetic new repeat');
  await page.locator('[name="amount"]').fill('20.00');
  await page.locator('[name="make_recurring"]').check();
  await page.locator('[name="repeat_frequency"]').selectOption('weekly');
  await page.locator('#expense-form button[type="submit"]').click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(writes.at(-1).name,'save_and_repeat_expense');
  assert.equal(writes.at(-1).body.p_id,null);
  assert.equal(writes.at(-1).body.p_schedule.frequency,'weekly');
  assert.equal(schedules.length,4);
  await page.locator('#search').fill('kirk');
  assert.ok(await page.locator('[data-edit="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]').count());
  await page.screenshot({path:'test-results/management-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.locator('#login').waitFor();
  await page.locator('#login [name="email"]').fill('synthetic@example.invalid');
  await page.locator('#login [name="password"]').fill('SyntheticOnlyPassword!23');
  await page.locator('#login button[type="submit"]').click();
  await page.getByText('Hi, Kirk').waitFor();
  assert.equal(await page.evaluate(()=>!!localStorage.getItem('sb-yjqitkswyeehqwotrdhz-auth-token')),true);
  await page.reload(); await page.getByText('Hi, Kirk').waitFor();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.locator('#login').waitFor();
  assert.equal(await page.evaluate(()=>!!localStorage.getItem('sb-yjqitkswyeehqwotrdhz-auth-token')),false);
  await page.locator('#login [name="email"]').fill('synthetic@example.invalid');
  await page.locator('#login [name="password"]').fill('SyntheticOnlyPassword!23');
  await page.locator('#login [name="remember"]').uncheck();
  await page.locator('#login button[type="submit"]').click();
  await page.getByText('Hi, Kirk').waitFor();
  assert.equal(await page.evaluate(()=>!!localStorage.getItem('sb-yjqitkswyeehqwotrdhz-auth-token')),false);
  assert.equal(await page.evaluate(()=>!!sessionStorage.getItem('sb-yjqitkswyeehqwotrdhz-auth-token')),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: isolated mobile UI edit/delete/history, recurring create/confirm/skip/pause, assumed payer search, icon metadata, remembered reload, signout clearing, and shared-device storage. All Supabase traffic mocked.');
} finally { await browser.close(); }
