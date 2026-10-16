import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchVisionBrowser } from '../scripts/vision-browser.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5174,strictPort:true}});let browser;
try {
 await server.listen();browser=await launchVisionBrowser();const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(120000);
 const requests=[];page.on('request',r=>{if(r.url().startsWith('https://'))requests.push({method:r.method(),url:r.url()});});
 await page.goto('http://127.0.0.1:5174');
 await page.locator('#image-input').setInputFiles('.vision-data/vue-paysage.jpg');
 await page.locator('#source-badge').filter({hasText:'Image prête'}).waitFor();
 await page.locator('#analyze').click();await page.locator('#metric-total').filter({hasText:/^\d+$/}).waitFor();
 const prediction=await page.evaluate(async()=>{const {getDetector}=await import('/src/detector.js');return (await getDetector()).detect(document.getElementById('frame'));});
 const ui55=await page.evaluate(()=>({total:Number(document.getElementById('metric-total').textContent),scores:document.getElementById('detections').textContent,frame:[document.getElementById('frame').width,document.getElementById('frame').height],overlay:[document.getElementById('overlay').width,document.getElementById('overlay').height],overlayVisible:!document.getElementById('overlay').hidden}));
 const retained=prediction.predictions.filter(p=>p.score>=.55);assert.equal(ui55.total,retained.length);assert(ui55.overlayVisible);assert.deepEqual(ui55.frame,ui55.overlay);
 for(const p of retained)assert(ui55.scores.includes(`${Math.round(p.score*100)} %`));
 await page.locator('#confidence').fill('20');const at20=Number(await page.locator('#metric-total').textContent());assert.equal(at20,prediction.predictions.length);
 await page.locator('#confidence').fill('95');assert.equal(await page.locator('#metric-total').textContent(),'0');assert(await page.locator('#overlay').isHidden());assert.match(await page.locator('#audit-status-description').textContent(),/ne prouve aucune absence/);
 await page.locator('#confidence').fill('55');await page.locator('#expected-chair').fill('16');await page.locator('#expected-table').fill('6');
 const chair=await page.locator('[data-equipment="chair"] .difference-value').textContent();const table=await page.locator('[data-equipment="table"] .difference-value').textContent();assert.equal(chair,'-14');assert.equal(table,'-6');
 for(const id of ['board','window'])assert.match(await page.locator(`[data-equipment="${id}"] .verification-value`).textContent(),/Contrôle manuel/);
 await page.screenshot({path:'.vision-data/recette-photo-ui.png',fullPage:true});
 await page.locator('#image-input').setInputFiles('.vision-data/vue-portrait.jpg');await page.locator('#source-badge').filter({hasText:'Image prête'}).waitFor();assert.equal(await page.locator('#metric-total').textContent(),'—');assert(await page.locator('#overlay').isHidden());
 assert(requests.every(r=>r.method==='GET'&&r.url.startsWith('https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/')));
 const output={at:new Date().toISOString(),kind:'real-photo-ui',sourceSha256:'',browser:browser.version(),ui55,totalAt20:at20,totalAt95:0,chairDifferenceWith16Expected:chair,tableDifferenceWith6Expected:table,manualCategoriesVerified:true,sourceChangeClearsResults:true,externalRequests:requests,rawPredictions:prediction.predictions};
 const {createHash}=await import('node:crypto');const {readFile}=await import('node:fs/promises');output.sourceSha256=createHash('sha256').update(await readFile('.vision-data/vue-paysage.jpg')).digest('hex');
 await writeFile('test-results/vision-photo-ui.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({total55:ui55.total,total20:at20,chair,table,checks:'passed'}));
}finally{await browser?.close();await server.close();}
