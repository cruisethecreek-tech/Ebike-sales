// Run the real ColorDoctor.gs against a fake Sheets API.
const fs = require('fs');
const src = fs.readFileSync('apps-script-color-save-doctor.snippet.gs', 'utf8');
let fails=0; const ok=(n,c,e='')=>{console.log((c?'PASS  ':'FAIL  ')+n+(e?'  '+e:''));if(!c)fails++;};

function makeSheet(headerColors) {
  const headers = ['Brand','ID','Name','Price', headerColors, 'Discontinued'];
  const data = [headers,
    ['Heybike','hybrid','Hybrid',1699,'{}',''],
    ['Heybike','venus','Venus',1499,'{"Step-Thru":{"One Size":[{"name":"Pink","hex":"#FFDCDC","img":"images/Venus Pink Badge Black.png"}]}}',''],
    ['Velotric','tempo','Tempo',1499,'{}',''],
  ];
  return { data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (r,c) => ({ setValue: v => { data[r-1][c-1] = v; },
                          getValue: () => data[r-1][c-1] }) };
}
function run(fn, sheet, arg) {
  const logs=[];
  const sb = { INV_SHEET_ID:'x', INV_TAB_NAME:'Inventory',
    SpreadsheetApp:{ openById:()=>({ getSheetByName:()=>sheet }), flush(){} },
    Logger:{ log:m=>logs.push(String(m)) }, JSON, String, Object, Array, Number };
  const keys=Object.keys(sb);
  const res = new Function(...keys, src + `\nreturn ${fn}(${arg===undefined?'':JSON.stringify(arg)});`)(...keys.map(k=>sb[k]));
  return { res, log: logs.join('\n') };
}

// Venus is sheet row 3 (header + Hybrid above it)
let sh = makeSheet('Colors (JSON)');
let { res, log } = run('diagnoseColorSave', sh, 'Venus');
ok('finds the right sheet row', res.rowIndex === 3, String(res.rowIndex));
ok('diagnose writes nothing', sh.data[2][4].includes('Venus Pink Badge Black'));
ok('reports swatch order', /1\. Pink/.test(log));
ok('states it is read-only', /Nothing was written/.test(log));

// The real fix
sh = makeSheet('Colors (JSON)');
({ res, log } = run('fixVenusColors', sh));
ok('fix confirms the write', res.ok === true);
const after = JSON.parse(sh.data[2][4]);
const list = after['Step-Thru']['One Size'];
ok('Blue is first', list[0].name === 'Blue', list.map(s=>s.name).join(','));
ok('Blue points at the new photo', list[0].img === 'images/Venus Blue.png');
ok('Pink repointed off the deleted file', list[1].img === 'images/Pink.png');
ok('White preserved', /cdn\.shopify\.com/.test(list[2].img));
ok('confirms by reading back', /CONFIRMED/.test(log));
ok('only Venus touched', sh.data[1][4]==='{}' && sh.data[3][4]==='{}');

// Bad JSON must be refused before touching the sheet
sh = makeSheet('Colors (JSON)');
({ res, log } = run('setColorsFor', sh, 'Venus'));
ok('refuses a missing/!invalid payload', res.ok === false);
ok('sheet untouched on refusal', sh.data[2][4].includes('Venus Pink Badge Black'));

// The exact header trap that breaks a stale deployment
sh = makeSheet('colors');
({ res, log } = run('diagnoseColorSave', sh, 'Venus'));
ok('plain "colors" header still works', res.ok === true);

// Unknown bike
sh = makeSheet('Colors (JSON)');
({ res, log } = run('diagnoseColorSave', sh, 'Nonesuch'));
ok('unknown bike reported, not crashed', res.ok === false && /No row named/.test(log));

console.log(fails?`\n${fails} FAILED`:'\nall passed');
process.exit(fails?1:0);
