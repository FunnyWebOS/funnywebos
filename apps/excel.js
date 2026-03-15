// ══════════════════════════════════════════════════════
// AETHERSHEETS — FULL FEATURED SPREADSHEET ENGINE
// ══════════════════════════════════════════════════════
const COLS = 26, ROWS = 200;
const COL_W = 100, ROW_H = 22;
const ROW_NUM_W = 46, COL_H = 24;

// ─── DATA MODEL ───
let wb = {
  name: 'Classeur1',
  sheets: [createSheet('Feuil1'), createSheet('Feuil2'), createSheet('Feuil3')],
  activeSheet: 0,
  modified: false,
};

function createSheet(name) {
  return { name, cells: {}, colWidths: {}, rowHeights: {}, frozenRow: 0, frozenCol: 0, filters: {}, hidden: {}, cf: [], dv: {}, comments: {}, merges: [] };
}

let sel = { r: 1, c: 1, r2: 1, c2: 1 }; // selection range (1-based)
let copyBuf = null;
let editCell = null;
let undoStack = [], redoStack = [];
let zoom = 100;
let showGridlines = true, showHeaders = true, showFBar = true;
let showFormulas = false;
let activeFilters = false;
let dragging = false;
let fillDragging = false;
let resizing = null;
let fnSelected = null;
let searchMatches = [], searchIdx = 0;
let currentFilePath = null;
let exportPickerRequestId = null;
let exportMode = 'export';

function sheet() { return wb.sheets[wb.activeSheet]; }
function cellKey(r, c) { return r + ',' + c; }
function colLetter(c) {
  if (c <= 26) return String.fromCharCode(64 + c);
  return String.fromCharCode(64 + Math.floor((c-1)/26)) + String.fromCharCode(65 + (c-1)%26);
}
function cellRef(r, c) { return colLetter(c) + r; }
function parseRef(ref) {
  const m = ref.match(/^([A-Z]{1,2})(\d+)$/i);
  if (!m) return null;
  const c = m[1].toUpperCase().split('').reduce((a,ch)=>a*26+(ch.charCodeAt(0)-64),0);
  return { r: parseInt(m[2]), c };
}
function rangeRefs(r1,c1,r2,c2) {
  const refs = [];
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) refs.push(cellRef(r,c));
  return refs;
}

// ─── CELL DATA ───
function getCell(r, c, sh) {
  const s = sh || sheet();
  return s.cells[cellKey(r,c)] || null;
}
function setCell(r, c, data, sh) {
  const s = sh || sheet();
  if (!data || (data.raw === '' && !data.fmt)) delete s.cells[cellKey(r,c)];
  else s.cells[cellKey(r,c)] = data;
  wb.modified = true;
}
function getCellRaw(r, c, sh) {
  const cd = getCell(r, c, sh);
  return cd ? cd.raw : '';
}
function getCellValue(r, c, sh) {
  const cd = getCell(r, c, sh);
  if (!cd) return '';
  if (cd.raw !== undefined && String(cd.raw).startsWith('=')) {
    return cd.calc !== undefined ? cd.calc : evalFormula(cd.raw, r, c, sh);
  }
  const n = parseFloat(cd.raw);
  return (!isNaN(n) && cd.raw !== '') ? n : (cd.raw || '');
}

// ─── FORMULA ENGINE ───
const FUNCTIONS = {
  SUM: (args) => args.reduce((s,v)=>s+(typeof v==='number'?v:0),0),
  AVERAGE: (args) => { const nums=args.filter(v=>typeof v==='number'); return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0; },
  COUNT: (args) => args.filter(v=>typeof v==='number'&&!isNaN(v)).length,
  COUNTA: (args) => args.filter(v=>v!==''&&v!==null&&v!==undefined).length,
  COUNTBLANK: (args) => args.filter(v=>v===''||v===null||v===undefined).length,
  MAX: (args) => { const n=args.filter(v=>typeof v==='number'); return n.length?Math.max(...n):''; },
  MIN: (args) => { const n=args.filter(v=>typeof v==='number'); return n.length?Math.min(...n):''; },
  MEDIAN: (args) => { const s=args.filter(v=>typeof v==='number').sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; },
  STDEV: (args) => { const n=args.filter(v=>typeof v==='number'); if(n.length<2)return 0; const m=n.reduce((a,b)=>a+b)/n.length; return Math.sqrt(n.reduce((s,v)=>s+(v-m)**2,0)/(n.length-1)); },
  VAR: (args) => { const s=FUNCTIONS.STDEV(args); return s*s; },
  ABS: (args) => Math.abs(+args[0]),
  SQRT: (args) => Math.sqrt(+args[0]),
  POWER: (args) => Math.pow(+args[0],+args[1]),
  MOD: (args) => (+args[0])%(+args[1]),
  INT: (args) => Math.floor(+args[0]),
  ROUND: (args) => parseFloat((+args[0]).toFixed(+args[1]||0)),
  ROUNDUP: (args) => Math.ceil((+args[0])*Math.pow(10,+args[1]||0))/Math.pow(10,+args[1]||0),
  ROUNDDOWN: (args) => Math.floor((+args[0])*Math.pow(10,+args[1]||0))/Math.pow(10,+args[1]||0),
  CEILING: (args) => Math.ceil(+args[0]/(+args[1]||1))*(+args[1]||1),
  FLOOR: (args) => Math.floor(+args[0]/(+args[1]||1))*(+args[1]||1),
  RAND: () => Math.random(),
  RANDBETWEEN: (args) => Math.floor(Math.random()*(+args[1]-+args[0]+1))+(+args[0]),
  PI: () => Math.PI,
  EXP: (args) => Math.exp(+args[0]),
  LN: (args) => Math.log(+args[0]),
  LOG: (args) => Math.log10(+args[0]),
  LOG2: (args) => Math.log2(+args[0]),
  SIN: (args) => Math.sin(+args[0]),
  COS: (args) => Math.cos(+args[0]),
  TAN: (args) => Math.tan(+args[0]),
  ASIN: (args) => Math.asin(+args[0]),
  ACOS: (args) => Math.acos(+args[0]),
  ATAN: (args) => Math.atan(+args[0]),
  ATAN2: (args) => Math.atan2(+args[0],+args[1]),
  SIGN: (args) => Math.sign(+args[0]),
  GCD: (args) => { let a=Math.abs(+args[0]),b=Math.abs(+args[1]); while(b){[a,b]=[b,a%b];} return a; },
  LCM: (args) => Math.abs(+args[0]*+args[1])/FUNCTIONS.GCD(args),
  SUMIF: (args, refs, r, c, sh) => {
    const [rangeStr, crit, sumStr] = args.map(String);
    const range = resolveRange(rangeStr, sh);
    const sumRange = sumStr ? resolveRange(sumStr, sh) : range;
    let total = 0;
    range.forEach((v, i) => {
      if (matchCriteria(v, crit)) total += typeof sumRange[i]==='number'?sumRange[i]:0;
    });
    return total;
  },
  COUNTIF: (args, refs, r, c, sh) => {
    const [rangeStr, crit] = args.map(String);
    const range = resolveRange(rangeStr, sh);
    return range.filter(v => matchCriteria(v, crit)).length;
  },
  AVERAGEIF: (args, refs, r, c, sh) => {
    const [rangeStr, crit, avgStr] = args.map(String);
    const range = resolveRange(rangeStr, sh);
    const avgRange = avgStr ? resolveRange(avgStr, sh) : range;
    const matching = [];
    range.forEach((v,i) => { if(matchCriteria(v, crit)) matching.push(typeof avgRange[i]==='number'?avgRange[i]:0); });
    return matching.length ? matching.reduce((a,b)=>a+b,0)/matching.length : 0;
  },
  IF: (args) => { const c=args[0]; return (c && c!==0 && c!=='FALSE' && c!=='false') ? args[1] : (args[2]!==undefined?args[2]:''); },
  AND: (args) => args.every(v=>v && v!=='FALSE'),
  OR: (args) => args.some(v=>v && v!=='FALSE'),
  NOT: (args) => !args[0] ? 'TRUE' : 'FALSE',
  XOR: (args) => args.filter(v=>v && v!=='FALSE').length % 2 === 1,
  IFERROR: (args) => { try { return String(args[0]).startsWith('#') ? (args[1]!==undefined?args[1]:'') : args[0]; } catch(e) { return args[1]||''; } },
  IFNA: (args) => (args[0]==='#N/A'?args[1]:args[0]),
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: (args) => args[0]===''||args[0]===null||args[0]===undefined,
  ISNUMBER: (args) => typeof args[0]==='number' && !isNaN(args[0]),
  ISTEXT: (args) => typeof args[0]==='string',
  ISERROR: (args) => typeof args[0]==='string' && args[0].startsWith('#'),
  ISNA: (args) => args[0]==='#N/A',
  TYPE: (args) => { const v=args[0]; if(typeof v==='number')return 1; if(typeof v==='string')return 2; if(typeof v==='boolean')return 4; return 64; },
  VLOOKUP: (args, refs, r, c, sh) => {
    const [val, tblStr, colIdx, exact] = args;
    const colN = parseInt(colIdx);
    const tbl = resolveTable(String(tblStr), sh);
    for (let i=0;i<tbl.length;i++) {
      if (exact===false||exact===0||String(exact).toLowerCase()==='false'
          ? String(tbl[i][0]).toLowerCase()===String(val).toLowerCase()
          : tbl[i][0]==val) {
        return tbl[i][colN-1]!==undefined ? tbl[i][colN-1] : '#N/A';
      }
    }
    if (!exact || exact===1 || String(exact).toLowerCase()==='true') {
      // approximate match (sorted)
      let res = '#N/A';
      for (let i=0;i<tbl.length;i++) {
        if (tbl[i][0] <= val) res = tbl[i][colN-1]!==undefined ? tbl[i][colN-1] : '#N/A';
        else break;
      }
      return res;
    }
    return '#N/A';
  },
  HLOOKUP: (args, refs, r, c, sh) => {
    const [val, tblStr, rowIdx] = args;
    const rowN = parseInt(rowIdx);
    const tbl = resolveTable(String(tblStr), sh);
    for (let c2=0; c2<(tbl[0]||[]).length; c2++) {
      if (tbl[0][c2] == val) return (tbl[rowN-1]||[])[c2]!==undefined ? tbl[rowN-1][c2] : '#N/A';
    }
    return '#N/A';
  },
  INDEX: (args, refs, r, c, sh) => {
    const [tblStr, rowN, colN] = args;
    const tbl = resolveTable(String(tblStr), sh);
    const ri = parseInt(rowN)-1, ci = parseInt(colN||1)-1;
    return (tbl[ri]||[])[ci]!==undefined ? tbl[ri][ci] : '#REF!';
  },
  MATCH: (args, refs, r, c, sh) => {
    const [val, rangeStr, type] = args;
    const range = resolveRange(String(rangeStr), sh);
    const t = parseInt(type)||0;
    for (let i=0;i<range.length;i++) {
      if (t===0 && String(range[i]).toLowerCase()===String(val).toLowerCase()) return i+1;
      if (t===1 && range[i]<=val) { if(i===range.length-1||range[i+1]>val) return i+1; }
      if (t===-1 && range[i]>=val) { if(i===range.length-1||range[i+1]<val) return i+1; }
    }
    return '#N/A';
  },
  OFFSET: (args, refs, r, c, sh) => {
    const ref = parseRef(String(args[0]));
    if (!ref) return '#REF!';
    const nr = ref.r + parseInt(args[1]), nc = ref.c + parseInt(args[2]);
    const h = parseInt(args[3])||1, w = parseInt(args[4])||1;
    if (h===1&&w===1) return getCellValue(nr, nc, sh);
    // return array ref string
    return rangeRefs(nr,nc,nr+h-1,nc+w-1).map(r=>{ const p=parseRef(r); return getCellValue(p.r,p.c,sh); });
  },
  CONCATENATE: (args) => args.map(String).join(''),
  CONCAT: (args) => args.map(v=>v===null||v===undefined?'':String(v)).join(''),
  TEXTJOIN: (args) => { const [delim, ignore, ...rest] = args; return rest.filter(v=>!ignore||(v!==''&&v!==null)).join(String(delim)); },
  LEFT: (args) => String(args[0]).slice(0, parseInt(args[1])||1),
  RIGHT: (args) => String(args[0]).slice(-parseInt(args[1])||1),
  MID: (args) => String(args[0]).substr(parseInt(args[1])-1, parseInt(args[2])),
  LEN: (args) => String(args[0]).length,
  TRIM: (args) => String(args[0]).trim(),
  UPPER: (args) => String(args[0]).toUpperCase(),
  LOWER: (args) => String(args[0]).toLowerCase(),
  PROPER: (args) => String(args[0]).replace(/\b\w/g, c=>c.toUpperCase()),
  SUBSTITUTE: (args) => String(args[0]).split(String(args[1])).join(String(args[2])),
  REPLACE: (args) => String(args[0]).slice(0,parseInt(args[1])-1)+String(args[3])+String(args[0]).slice(parseInt(args[1])-1+parseInt(args[2])),
  FIND: (args) => { const i=String(args[1]).indexOf(String(args[0]),parseInt(args[2]||1)-1); return i>=0?i+1:'#VALUE!'; },
  SEARCH: (args) => { const i=String(args[1]).toLowerCase().indexOf(String(args[0]).toLowerCase()); return i>=0?i+1:'#VALUE!'; },
  TEXT: (args) => formatNumber(+args[0], String(args[1])),
  VALUE: (args) => { const n=parseFloat(String(args[0]).replace(/[^0-9.-]/g,'')); return isNaN(n)?'#VALUE!':n; },
  REPT: (args) => String(args[0]).repeat(parseInt(args[1])),
  EXACT: (args) => String(args[0])===String(args[1]),
  CHAR: (args) => String.fromCharCode(+args[0]),
  CODE: (args) => (String(args[0])||'').charCodeAt(0),
  TODAY: () => { const d=new Date(); return dateToSerial(d); },
  NOW: () => { const d=new Date(); return dateToSerial(d)+(d.getHours()*3600+d.getMinutes()*60+d.getSeconds())/86400; },
  DATE: (args) => dateToSerial(new Date(+args[0],+args[1]-1,+args[2])),
  TIME: (args) => ((+args[0])*3600+(+args[1])*60+(+args[2]))/86400,
  YEAR: (args) => serialToDate(+args[0]).getFullYear(),
  MONTH: (args) => serialToDate(+args[0]).getMonth()+1,
  DAY: (args) => serialToDate(+args[0]).getDate(),
  HOUR: (args) => Math.floor(((+args[0])%1)*24),
  MINUTE: (args) => Math.floor(((+args[0])%1)*1440)%60,
  SECOND: (args) => Math.floor(((+args[0])%1)*86400)%60,
  WEEKDAY: (args) => serialToDate(+args[0]).getDay()+1,
  NETWORKDAYS: (args) => { let d=serialToDate(+args[0]),e=serialToDate(+args[1]),n=0; while(d<=e){const w=d.getDay();if(w!==0&&w!==6)n++;d.setDate(d.getDate()+1);} return n; },
  EDATE: (args) => { const d=serialToDate(+args[0]); d.setMonth(d.getMonth()+parseInt(args[1])); return dateToSerial(d); },
  EOMONTH: (args) => { const d=serialToDate(+args[0]); d.setMonth(d.getMonth()+parseInt(args[1])+1,0); return dateToSerial(d); },
  ROW: (args, refs, r) => r,
  COLUMN: (args, refs, r, c) => c,
  ROWS: (args, refs, r, c, sh) => { const rr = parseRange(String(args[0])); return rr ? rr.r2-rr.r1+1 : 1; },
  COLUMNS: (args, refs, r, c, sh) => { const rr = parseRange(String(args[0])); return rr ? rr.c2-rr.c1+1 : 1; },
  ADDRESS: (args) => { const abs=(v)=>parseInt(args[2])!==4?'$'+v:v; return abs(colLetter(+args[1]))+abs(String(+args[0])); },
  INDIRECT: (args, refs, r, c, sh) => { const p=parseRef(String(args[0])); return p?getCellValue(p.r,p.c,sh):'#REF!'; },
  TRANSPOSE: (args) => args,
  LARGE: (args, refs, r, c, sh) => { const range=resolveRange(String(args[0]),sh); const sorted=range.filter(v=>typeof v==='number').sort((a,b)=>b-a); return sorted[+args[1]-1]||''; },
  SMALL: (args, refs, r, c, sh) => { const range=resolveRange(String(args[0]),sh); const sorted=range.filter(v=>typeof v==='number').sort((a,b)=>a-b); return sorted[+args[1]-1]||''; },
  RANK: (args, refs, r, c, sh) => { const v=+args[0]; const range=resolveRange(String(args[1]),sh).filter(x=>typeof x==='number'); const ord=+args[2]||0; const sorted=range.slice().sort((a,b)=>ord?a-b:b-a); return sorted.indexOf(v)+1; },
  PERCENTILE: (args, refs, r, c, sh) => { const arr=resolveRange(String(args[0]),sh).filter(v=>typeof v==='number').sort((a,b)=>a-b); const p=+args[1]; const i=p*(arr.length-1); return arr[Math.floor(i)]+(arr[Math.ceil(i)]-arr[Math.floor(i)])*(i%1); },
  NPV: (args) => { const r=+args[0]; return args.slice(1).reduce((acc,v,i)=>acc+(+v)/Math.pow(1+r,i+1),0); },
  PMT: (args) => { const [r,n,pv,fv,type] = args.map(Number); if(r===0) return -(pv+(fv||0))/n; const q=Math.pow(1+r,n); return -(r*(pv*q+(fv||0)))/((q-1)*(1+(type||0)*r)); },
  FV: (args) => { const [r,n,pmt,pv,type]=args.map(Number); const q=Math.pow(1+r,n); return -(pv*q+pmt*(1+(type||0)*r)*(q-1)/r); },
  PV: (args) => { const [r,n,pmt,fv,type]=args.map(Number); const q=Math.pow(1+r,n); return -(pmt*(1+(type||0)*r)*(1-1/q)/r+(fv||0)/q); },
  RATE: (args) => { let r=0.1; for(let i=0;i<100;i++){const f=FUNCTIONS.PV([r,+args[0],+args[1],+args[2]]||0)+args[3]; r-=f/10000;} return r; },
};

const FN_INFO = {
  SUM:{cat:'math',syntax:'SUM(nombre1,nombre2,...)',desc:'Additionne tous les nombres dans une plage.'},
  AVERAGE:{cat:'stat',syntax:'AVERAGE(nombre1,nombre2,...)',desc:'Calcule la moyenne arithmétique.'},
  COUNT:{cat:'stat',syntax:'COUNT(valeur1,...)',desc:'Compte les cellules contenant des nombres.'},
  COUNTA:{cat:'stat',syntax:'COUNTA(valeur1,...)',desc:'Compte les cellules non vides.'},
  MAX:{cat:'stat',syntax:'MAX(nombre1,...)',desc:'Retourne la valeur maximale.'},
  MIN:{cat:'stat',syntax:'MIN(nombre1,...)',desc:'Retourne la valeur minimale.'},
  IF:{cat:'logic',syntax:'IF(test,valeur_si_vrai,valeur_si_faux)',desc:'Effectue un test logique.'},
  AND:{cat:'logic',syntax:'AND(logique1,logique2,...)',desc:'Retourne VRAI si tous les arguments sont vrais.'},
  OR:{cat:'logic',syntax:'OR(logique1,...)',desc:'Retourne VRAI si au moins un argument est vrai.'},
  NOT:{cat:'logic',syntax:'NOT(logique)',desc:'Inverse la valeur logique.'},
  IFERROR:{cat:'logic',syntax:'IFERROR(valeur,valeur_si_erreur)',desc:'Retourne une valeur si une erreur est générée.'},
  VLOOKUP:{cat:'lookup',syntax:'VLOOKUP(val,tableau,no_col,exact)',desc:'Recherche verticale dans un tableau.'},
  HLOOKUP:{cat:'lookup',syntax:'HLOOKUP(val,tableau,no_ligne,exact)',desc:'Recherche horizontale.'},
  INDEX:{cat:'lookup',syntax:'INDEX(tableau,no_ligne,no_col)',desc:'Retourne la valeur à une position.'},
  MATCH:{cat:'lookup',syntax:'MATCH(val,tableau,type)',desc:'Retourne la position relative.'},
  OFFSET:{cat:'lookup',syntax:'OFFSET(réf,lignes,cols,hauteur,largeur)',desc:'Retourne une référence décalée.'},
  INDIRECT:{cat:'lookup',syntax:'INDIRECT(réf_texte)',desc:'Retourne la référence spécifiée par un texte.'},
  CONCATENATE:{cat:'text',syntax:'CONCATENATE(texte1,texte2,...)',desc:'Concatène plusieurs chaînes.'},
  LEFT:{cat:'text',syntax:'LEFT(texte,nb_car)',desc:'Retourne les premiers caractères.'},
  RIGHT:{cat:'text',syntax:'RIGHT(texte,nb_car)',desc:'Retourne les derniers caractères.'},
  MID:{cat:'text',syntax:'MID(texte,départ,nb_car)',desc:'Retourne une sous-chaîne.'},
  LEN:{cat:'text',syntax:'LEN(texte)',desc:'Retourne le nombre de caractères.'},
  TRIM:{cat:'text',syntax:'TRIM(texte)',desc:'Supprime les espaces superflus.'},
  UPPER:{cat:'text',syntax:'UPPER(texte)',desc:'Convertit en majuscules.'},
  LOWER:{cat:'text',syntax:'LOWER(texte)',desc:'Convertit en minuscules.'},
  TEXT:{cat:'text',syntax:'TEXT(nombre,format)',desc:'Convertit un nombre en texte formaté.'},
  TODAY:{cat:'date',syntax:'TODAY()',desc:'Retourne la date du jour.'},
  NOW:{cat:'date',syntax:'NOW()',desc:'Retourne la date et l\'heure actuelles.'},
  DATE:{cat:'date',syntax:'DATE(année,mois,jour)',desc:'Retourne un numéro de série de date.'},
  YEAR:{cat:'date',syntax:'YEAR(numéro_série)',desc:'Retourne l\'année d\'une date.'},
  MONTH:{cat:'date',syntax:'MONTH(numéro_série)',desc:'Retourne le mois.'},
  DAY:{cat:'date',syntax:'DAY(numéro_série)',desc:'Retourne le jour.'},
  SUMIF:{cat:'math',syntax:'SUMIF(plage,critère,plage_somme)',desc:'Additionne selon critère.'},
  COUNTIF:{cat:'stat',syntax:'COUNTIF(plage,critère)',desc:'Compte selon critère.'},
  AVERAGEIF:{cat:'stat',syntax:'AVERAGEIF(plage,critère,plage_moy)',desc:'Moyenne selon critère.'},
  ROUND:{cat:'math',syntax:'ROUND(nombre,nb_chiffres)',desc:'Arrondit à un nombre de décimales.'},
  ABS:{cat:'math',syntax:'ABS(nombre)',desc:'Retourne la valeur absolue.'},
  SQRT:{cat:'math',syntax:'SQRT(nombre)',desc:'Retourne la racine carrée.'},
  POWER:{cat:'math',syntax:'POWER(nombre,exposant)',desc:'Élève un nombre à une puissance.'},
  PMT:{cat:'math',syntax:'PMT(taux,npm,va)',desc:'Calcule le paiement d\'un emprunt.'},
  NPV:{cat:'math',syntax:'NPV(taux,valeur1,...)',desc:'Calcule la valeur actuelle nette.'},
  RANK:{cat:'stat',syntax:'RANK(nombre,réf,ordre)',desc:'Retourne le rang d\'un nombre.'},
  LARGE:{cat:'stat',syntax:'LARGE(tableau,k)',desc:'Retourne la k-ième plus grande valeur.'},
  SMALL:{cat:'stat',syntax:'SMALL(tableau,k)',desc:'Retourne la k-ième plus petite valeur.'},
  STDEV:{cat:'stat',syntax:'STDEV(nombre1,...)',desc:'Calcule l\'écart-type d\'un échantillon.'},
  MEDIAN:{cat:'stat',syntax:'MEDIAN(nombre1,...)',desc:'Retourne la valeur médiane.'},
};

function resolveRange(rangeStr, sh) {
  const rr = parseRange(rangeStr);
  if (!rr) { const p=parseRef(rangeStr); return p?[getCellValue(p.r,p.c,sh||sheet())]:[ ]; }
  const vals = [];
  for (let r=rr.r1;r<=rr.r2;r++) for (let c=rr.c1;c<=rr.c2;c++) vals.push(getCellValue(r,c,sh||sheet()));
  return vals;
}

function resolveTable(rangeStr, sh) {
  const rr = parseRange(rangeStr);
  if (!rr) return [];
  const rows = [];
  for (let r=rr.r1;r<=rr.r2;r++) {
    const row = [];
    for (let c=rr.c1;c<=rr.c2;c++) row.push(getCellValue(r,c,sh||sheet()));
    rows.push(row);
  }
  return rows;
}

function parseRange(ref) {
  const m = ref.match(/^([A-Z]{1,2})(\d+):([A-Z]{1,2})(\d+)$/i);
  if (!m) return null;
  const c1 = m[1].toUpperCase().split('').reduce((a,ch)=>a*26+(ch.charCodeAt(0)-64),0);
  const r1 = parseInt(m[2]);
  const c2 = m[3].toUpperCase().split('').reduce((a,ch)=>a*26+(ch.charCodeAt(0)-64),0);
  const r2 = parseInt(m[4]);
  return { r1: Math.min(r1,r2), c1: Math.min(c1,c2), r2: Math.max(r1,r2), c2: Math.max(c1,c2) };
}

function matchCriteria(val, crit) {
  const s = String(crit);
  if (s.startsWith('>=')) return +val >= +s.slice(2);
  if (s.startsWith('<=')) return +val <= +s.slice(2);
  if (s.startsWith('<>')) return String(val) !== s.slice(2);
  if (s.startsWith('>')) return +val > +s.slice(1);
  if (s.startsWith('<')) return +val < +s.slice(1);
  if (s.startsWith('=')) return String(val) === s.slice(1);
  if (s.includes('*') || s.includes('?')) {
    const re = new RegExp('^' + s.replace(/\*/g,'.*').replace(/\?/g,'.') + '$', 'i');
    return re.test(String(val));
  }
  return String(val).toLowerCase() === s.toLowerCase();
}

function dateToSerial(d) { return Math.floor((d - new Date(1900,0,1)) / 86400000) + 2; }
function serialToDate(n) { return new Date(new Date(1900,0,1).getTime() + (n-2)*86400000); }

function evalFormula(formula, r, c, sh) {
  if (!formula || !String(formula).startsWith('=')) return formula;
  const expr = String(formula).slice(1).trim();
  try {
    return evalExpr(expr, r, c, sh || sheet());
  } catch(e) {
    return '#ERROR!';
  }
}

function evalExpr(expr, r, c, sh) {
  // Check for range (A1:B2) not inside function
  const trimmed = expr.trim();

  // String literal
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1,-1);

  // Boolean
  if (trimmed.toUpperCase()==='TRUE') return true;
  if (trimmed.toUpperCase()==='FALSE') return false;

  // Tokenize and evaluate with operator precedence
  return parseExpression(trimmed, r, c, sh);
}

function parseExpression(expr, r, c, sh) {
  // Handle comparison operators (lowest precedence)
  const compareOps = ['>=', '<=', '<>', '>', '<', '='];
  for (const op of compareOps) {
    const idx = findOperator(expr, op);
    if (idx !== -1) {
      const left = evalExpr(expr.slice(0, idx), r, c, sh);
      const right = evalExpr(expr.slice(idx + op.length), r, c, sh);
      switch(op) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '<>': return left != right;
        case '=': return left == right;
      }
    }
  }

  // Concatenation &
  const ampIdx = findOperator(expr, '&');
  if (ampIdx !== -1) {
    return String(evalExpr(expr.slice(0,ampIdx),r,c,sh)) + String(evalExpr(expr.slice(ampIdx+1),r,c,sh));
  }

  // Addition/Subtraction
  const addIdx = findAddSub(expr);
  if (addIdx !== -1) {
    const op = expr[addIdx];
    const left = evalExpr(expr.slice(0, addIdx), r, c, sh);
    const right = evalExpr(expr.slice(addIdx + 1), r, c, sh);
    return op === '+' ? (+left) + (+right) : (+left) - (+right);
  }

  // Multiplication/Division/Modulo
  const mulIdx = findMulDiv(expr);
  if (mulIdx !== -1) {
    const op = expr[mulIdx];
    const left = evalExpr(expr.slice(0, mulIdx), r, c, sh);
    const right = evalExpr(expr.slice(mulIdx + 1), r, c, sh);
    if (op === '*') return (+left) * (+right);
    if (op === '/') return (+right) === 0 ? '#DIV/0!' : (+left) / (+right);
    if (op === '%') return (+left) % (+right);
  }

  // Exponentiation ^
  const expIdx = findOperator(expr, '^');
  if (expIdx !== -1) {
    return Math.pow(+evalExpr(expr.slice(0,expIdx),r,c,sh), +evalExpr(expr.slice(expIdx+1),r,c,sh));
  }

  // Unary minus
  if (expr.startsWith('-')) {
    return -(+evalExpr(expr.slice(1), r, c, sh));
  }

  // Parentheses
  if (expr.startsWith('(') && findMatchingParen(expr, 0) === expr.length-1) {
    return evalExpr(expr.slice(1, -1), r, c, sh);
  }

  // Function call
  const fnMatch = expr.match(/^([A-Z][A-Z0-9_]*)\s*\((.*)\)$/is);
  if (fnMatch) {
    const fnName = fnMatch[1].toUpperCase();
    const argsStr = fnMatch[2];
    const args = splitArgs(argsStr).map(a => {
      a = a.trim();
      // If arg is a range, resolve it
      if (/^[A-Z]{1,2}\d+:[A-Z]{1,2}\d+$/i.test(a)) return resolveRange(a, sh);
      return evalExpr(a, r, c, sh);
    }).flat();
    const fn = FUNCTIONS[fnName];
    if (fn) return fn(args, null, r, c, sh);
    return '#NAME?';
  }

  // Cell reference or range
  if (/^[A-Z]{1,2}\d+:[A-Z]{1,2}\d+$/i.test(expr)) {
    return resolveRange(expr, sh);
  }
  const refP = parseRef(expr);
  if (refP) return getCellValue(refP.r, refP.c, sh);

  // Number
  const n = parseFloat(expr);
  if (!isNaN(n)) return n;

  // String (unquoted)
  return expr;
}

function findOperator(expr, op) {
  let depth = 0, inStr = false;
  for (let i = 0; i <= expr.length - op.length; i++) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && expr.slice(i, i+op.length) === op) return i;
  }
  return -1;
}

function findAddSub(expr) {
  let depth = 0, inStr = false;
  for (let i = expr.length-1; i >= 0; i--) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    if (depth === 0 && (ch === '+' || ch === '-') && i > 0 && expr[i-1] !== 'E' && expr[i-1] !== 'e') return i;
  }
  return -1;
}

function findMulDiv(expr) {
  let depth = 0, inStr = false;
  for (let i = expr.length-1; i >= 0; i--) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    if (depth === 0 && (ch === '*' || ch === '/' || ch === '%')) return i;
  }
  return -1;
}

function findMatchingParen(expr, start) {
  let depth = 0;
  for (let i = start; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitArgs(str) {
  const args = [];
  let depth = 0, inStr = false, cur = '';
  for (const ch of str) {
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  args.push(cur);
  return args;
}

function formatNumber(val, fmt, numFmt) {
  const nf = numFmt || (getCell(sel.r, sel.c)||{}).fmt;
  if (val === '' || val === null || val === undefined) return '';
  
  const f = fmt || (nf && nf.numFmt) || 'general';
  if (f === 'general') {
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toPrecision(10).replace(/\.?0+$/, '');
    return String(val);
  }
  if (f === 'number') {
    const dec = (nf&&nf.dec!==undefined) ? nf.dec : 2;
    const sep = !(nf&&nf.sep===false);
    let n = parseFloat(val);
    if (isNaN(n)) return String(val);
    return sep ? n.toLocaleString('fr-FR', {minimumFractionDigits:dec,maximumFractionDigits:dec}) : n.toFixed(dec);
  }
  if (f === 'currency') {
    const dec = (nf&&nf.dec!==undefined)?nf.dec:2;
    return parseFloat(val).toLocaleString('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:dec,maximumFractionDigits:dec});
  }
  if (f === 'percent') {
    const dec = (nf&&nf.dec!==undefined)?nf.dec:2;
    return (parseFloat(val)*100).toFixed(dec) + '%';
  }
  if (f === 'scientific') return parseFloat(val).toExponential(2);
  if (f === 'date') { try { const d=serialToDate(+val); return d.toLocaleDateString('fr-FR'); } catch(e){return String(val);} }
  if (f === 'time') { const t=+val%1; const h=Math.floor(t*24),m=Math.floor(t*1440)%60,s=Math.floor(t*86400)%60; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  if (f === 'datetime') { try { const d=serialToDate(+val); return d.toLocaleString('fr-FR'); } catch(e){return String(val);} }
  if (f === 'text') return String(val);
  // custom format
  return String(val);
}

// ─── RECALCULATE ALL ───
function recalcAll() {
  const sh = sheet();
  Object.keys(sh.cells).forEach(key => {
    const cd = sh.cells[key];
    if (cd && String(cd.raw).startsWith('=')) {
      const [r,c] = key.split(',').map(Number);
      cd.calc = evalFormula(cd.raw, r, c, sh);
    }
  });
  renderGrid();
}

// ─── GRID RENDERING ───
function initGrid() {
  // Column headers
  const colH = document.getElementById('col-headers');
  for (let c = 1; c <= COLS; c++) {
    const h = document.createElement('div');
    h.className = 'col-header';
    h.id = 'ch-' + c;
    h.style.minWidth = COL_W + 'px';
    h.textContent = colLetter(c);
    h.onclick = (e) => selectColumn(c, e.shiftKey);
    h.ondblclick = () => autoFitColN(c);
    // Resize handle
    const rh = document.createElement('div');
    rh.className = 'col-resize';
    rh.onmousedown = (e) => startColResize(e, c);
    h.appendChild(rh);
    colH.appendChild(h);
  }

  // Rows
  const rc = document.getElementById('rows-container');
  rc.innerHTML = '';
  for (let r = 1; r <= ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.id = 'row-' + r;
    row.style.height = ROW_H + 'px';

    const rn = document.createElement('div');
    rn.className = 'row-num';
    rn.id = 'rn-' + r;
    rn.textContent = r;
    rn.onclick = (e) => selectRow(r, e.shiftKey);
    row.appendChild(rn);

    for (let c = 1; c <= COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.id = 'c-' + r + '-' + c;
      cell.setAttribute('data-r', r);
      cell.setAttribute('data-c', c);
      cell.onclick = (e) => cellClick(r, c, e);
      cell.ondblclick = () => startEdit(r, c);
      cell.oncontextmenu = (e) => cellRightClick(e, r, c);
      row.appendChild(cell);
    }
    rc.appendChild(row);
  }
  renderGrid();
  updateSelBox();
}

function renderGrid() {
  const sh = sheet();
  for (let r = 1; r <= ROWS; r++) {
    const rowEl = document.getElementById('row-' + r);
    if (!rowEl) continue;
    if (sh.rowHeights[r]) rowEl.style.height = sh.rowHeights[r] + 'px';
    else rowEl.style.height = ROW_H + 'px';
    const rn = document.getElementById('rn-' + r);
    if (rn) rn.style.display = showHeaders ? '' : 'none';
    if (sh.hidden[r]) { rowEl.style.display = 'none'; continue; }
    else rowEl.style.display = '';

    for (let c = 1; c <= COLS; c++) {
      const el = document.getElementById('c-' + r + '-' + c);
      if (!el) continue;
      renderCell(el, r, c, sh);
    }
  }
  document.getElementById('col-headers').style.display = showHeaders ? 'flex' : 'none';
  updateFilterIndicators();
  applyCFAll();
}

function renderCell(el, r, c, sh) {
  sh = sh || sheet();
  const cd = getCell(r, c, sh);
  let val = '';
  let raw = cd ? cd.raw : '';

  if (showFormulas && raw && String(raw).startsWith('=')) {
    val = raw;
  } else if (raw !== undefined && raw !== null && raw !== '') {
    if (String(raw).startsWith('=')) {
      if (cd.calc === undefined) cd.calc = evalFormula(raw, r, c, sh);
      val = cd.calc;
    } else {
      val = raw;
    }
    val = formatNumber(val, null, cd ? cd.fmt : null);
  }

  // Apply formatting
  el.className = 'cell';
  el.style.cssText = '';
  const fmt = cd ? cd.fmt : null;
  if (fmt) {
    if (fmt.bold) el.classList.add('bold-cell');
    if (fmt.italic) el.classList.add('italic-cell');
    if (fmt.underline) el.classList.add('underline-cell');
    if (fmt.strike) el.style.textDecoration = 'line-through';
    if (fmt.align) el.style.justifyContent = fmt.align === 'left' ? 'flex-start' : fmt.align === 'right' ? 'flex-end' : 'center';
    if (fmt.valign) el.style.alignItems = fmt.valign === 'top' ? 'flex-start' : fmt.valign === 'bottom' ? 'flex-end' : 'center';
    if (fmt.color) el.style.color = fmt.color;
    if (fmt.bg) el.style.background = fmt.bg;
    if (fmt.font) el.style.fontFamily = fmt.font;
    if (fmt.fontSize) el.style.fontSize = fmt.fontSize + 'px';
    if (fmt.wrap) el.classList.add('wrap-cell');
    if (fmt.border) {
      const b = fmt.border;
      if (b.all) el.style.outline = b.all;
      if (b.top) el.style.borderTop = b.top;
      if (b.bottom) el.style.borderBottom = b.bottom;
      if (b.left) el.style.borderLeft = b.left;
      if (b.right) el.style.borderRight = b.right;
    }
    if (fmt.indent) el.style.paddingLeft = (4 + fmt.indent*12) + 'px';
  }

  // Number alignment
  const n = parseFloat(val);
  if (!isNaN(n) && val !== '' && !(fmt && fmt.align)) el.classList.add('number-cell');

  // Formula/error
  if (raw && String(raw).startsWith('=')) {
    if (String(val).startsWith('#')) el.classList.add('error-cell');
    else if (!showFormulas) el.classList.add('formula-cell');
  }

  // Col width
  const w = sh.colWidths[c] || COL_W;
  el.style.minWidth = w + 'px';
  el.style.maxWidth = w + 'px';
  el.style.width = w + 'px';

  el.setAttribute('data-r', r);
  el.setAttribute('data-c', c);
  el.onclick = (e) => cellClick(r, c, e);
  el.ondblclick = () => startEdit(r, c);
  el.oncontextmenu = (e) => cellRightClick(e, r, c);

  // Add comment indicator
  if (sh.comments[cellKey(r,c)]) {
    el.style.boxShadow = 'inset -4px 0 0 #ff9800';
  }

  // Selection state
  if (r >= Math.min(sel.r,sel.r2) && r <= Math.max(sel.r,sel.r2) &&
      c >= Math.min(sel.c,sel.c2) && c <= Math.max(sel.c,sel.c2)) {
    if (r === sel.r && c === sel.c) el.classList.add('selected');
    else el.classList.add('in-range');
  }

  if (editCell && editCell.r === r && editCell.c === c) return; // don't overwrite editor
  el.textContent = String(val);
}

function updateSelBox() {
  const el1 = document.getElementById('c-' + sel.r + '-' + sel.c);
  const el2 = document.getElementById('c-' + sel.r2 + '-' + sel.c2);
  const box = document.getElementById('sel-box');
  const fh = document.getElementById('fill-handle');
  if (!el1 || !el2) { box.style.display='none'; fh.style.display='none'; return; }

  const r1 = Math.min(sel.r, sel.r2), c1 = Math.min(sel.c, sel.c2);
  const r2 = Math.max(sel.r, sel.r2), c2 = Math.max(sel.c, sel.c2);
  const topEl = document.getElementById('c-'+r1+'-'+c1);
  const botEl = document.getElementById('c-'+r2+'-'+c2);
  if (!topEl || !botEl) return;

  const cont = document.getElementById('grid-container');
  const contRect = cont.getBoundingClientRect();
  const tRect = topEl.getBoundingClientRect();
  const bRect = botEl.getBoundingClientRect();

  const x = tRect.left - contRect.left;
  const y = tRect.top - contRect.top + document.getElementById('grid-scroll').scrollTop - COL_H;
  const w = bRect.right - tRect.left;
  const h = bRect.bottom - tRect.top;

  box.style.display = '';
  box.style.left = x + 'px';
  box.style.top = (y + COL_H) + 'px';
  box.style.width = w + 'px';
  box.style.height = h + 'px';

  fh.style.display = '';
  fh.style.left = (x + w - 4) + 'px';
  fh.style.top = (y + COL_H + h - 4) + 'px';
}

// ─── SELECTION ───
function cellClick(r, c, e) {
  if (editCell) commitEdit();
  if (e && e.shiftKey) {
    sel.r2 = r; sel.c2 = c;
  } else {
    sel = { r, c, r2: r, c2: c };
  }
  updateUIFromSel();
}

function selectRow(r, shift) {
  if (editCell) commitEdit();
  if (shift) { sel.r2 = r; sel.c = 1; sel.c2 = COLS; }
  else { sel = { r, c: 1, r2: r, c2: COLS }; }
  updateUIFromSel();
}

function selectColumn(c, shift) {
  if (editCell) commitEdit();
  if (shift) { sel.c2 = c; sel.r = 1; sel.r2 = ROWS; }
  else { sel = { r: 1, c, r2: ROWS, c2: c }; }
  updateUIFromSel();
}

function selectAll() {
  sel = { r: 1, c: 1, r2: ROWS, c2: COLS };
  updateUIFromSel();
}

function updateUIFromSel() {
  renderGrid();
  updateSelBox();
  const ref = cellRef(sel.r, sel.c);
  document.getElementById('name-box').value = sel.r===sel.r2&&sel.c===sel.c2 ? ref : ref+':'+cellRef(sel.r2,sel.c2);
  const cd = getCell(sel.r, sel.c);
  document.getElementById('formula-input').value = cd ? cd.raw || '' : '';
  document.getElementById('sb-sel').textContent = ref;
  updateRibbonState();
  updateStatusBarStats();
  updateSelInfoPanel();
}

function updateSelInfoPanel() {
  const ref = cellRef(sel.r, sel.c);
  let info = `<strong>${ref}</strong><br>`;
  const cd = getCell(sel.r, sel.c);
  if (cd) {
    if (cd.raw && String(cd.raw).startsWith('=')) info += `Formule: ${cd.raw}<br>Valeur: ${cd.calc !== undefined ? cd.calc : ''}`;
    else info += `Valeur: ${cd.raw || ''}`;
    if (cd.fmt) info += `<br>Format: ${cd.fmt.numFmt||''}`;
  }
  document.getElementById('sel-info-panel').innerHTML = info;
}

function updateRibbonState() {
  const cd = getCell(sel.r, sel.c);
  const fmt = cd ? cd.fmt : null;
  document.getElementById('rb-bold')?.classList.toggle('pressed', !!(fmt&&fmt.bold));
  document.getElementById('rb-italic')?.classList.toggle('pressed', !!(fmt&&fmt.italic));
  document.getElementById('rb-underline')?.classList.toggle('pressed', !!(fmt&&fmt.underline));
  document.getElementById('rb-wrap')?.classList.toggle('pressed', !!(fmt&&fmt.wrap));
  if (fmt) {
    if (fmt.font && document.getElementById('r-font')) document.getElementById('r-font').value = fmt.font;
    if (fmt.fontSize && document.getElementById('r-size')) document.getElementById('r-size').value = fmt.fontSize;
  }
}

function updateStatusBarStats() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  const vals = [];
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    const v = getCellValue(r, c);
    if (typeof v === 'number') vals.push(v);
  }
  if (vals.length > 1) {
    const sum = vals.reduce((a,b)=>a+b,0);
    document.getElementById('sb-avg').style.display='';
    document.getElementById('sb-count').style.display='';
    document.getElementById('sb-sum').style.display='';
    document.getElementById('sb-min').style.display='';
    document.getElementById('sb-max').style.display='';
    document.getElementById('sb-avg-val').textContent = (sum/vals.length).toFixed(2);
    document.getElementById('sb-count-val').textContent = vals.length;
    document.getElementById('sb-sum-val').textContent = sum.toFixed(2);
    document.getElementById('sb-min-val').textContent = Math.min(...vals);
    document.getElementById('sb-max-val').textContent = Math.max(...vals);
  } else {
    ['sb-avg','sb-count','sb-sum','sb-min','sb-max'].forEach(id=>document.getElementById(id).style.display='none');
  }
}

// ─── EDIT ───
function startEdit(r, c, initialChar) {
  if (editCell) commitEdit();
  editCell = { r, c };
  const el = document.getElementById('c-' + r + '-' + c);
  if (!el) return;
  const cd = getCell(r, c);
  const raw = cd ? cd.raw || '' : '';
  el.classList.add('editing');
  el.innerHTML = '';
  const inp = document.createElement('input');
  inp.value = initialChar !== undefined ? initialChar : raw;
  inp.onkeydown = editKeyDown;
  inp.oninput = editInputHandler;
  inp.onblur = () => { if (editCell) commitEdit(); };
  el.appendChild(inp);
  inp.focus();
  if (initialChar !== undefined) inp.setSelectionRange(inp.value.length, inp.value.length);
  else inp.select();
  document.getElementById('formula-input').value = inp.value;
}

function commitEdit() {
  if (!editCell) return;
  const { r, c } = editCell;
  const el = document.getElementById('c-' + r + '-' + c);
  if (!el) { editCell = null; return; }
  const inp = el.querySelector('input');
  const val = inp ? inp.value : el.textContent;

  saveUndoState();
  const cd = getCell(r, c) || {};
  cd.raw = val;
  if (String(val).startsWith('=')) {
    cd.calc = evalFormula(val, r, c);
  } else {
    delete cd.calc;
  }
  setCell(r, c, val === '' && !cd.fmt ? null : cd);

  editCell = null;
  el.classList.remove('editing');
  renderCell(el, r, c);
  updateSelBox();
  updateStatusBarStats();
  document.getElementById('formula-input').value = val;
  hideFnHint();
}

function cancelEdit() {
  if (!editCell) return;
  const { r, c } = editCell;
  editCell = null;
  const el = document.getElementById('c-' + r + '-' + c);
  if (el) { el.classList.remove('editing'); renderCell(el, r, c); }
}

function editKeyDown(e) {
  const {r, c} = editCell;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); commitEdit();
    moveSelection(1, 0, e.ctrlKey);
  } else if (e.key === 'Tab') {
    e.preventDefault(); commitEdit();
    moveSelection(0, e.shiftKey ? -1 : 1, false);
  } else if (e.key === 'Escape') {
    cancelEdit();
  } else if (e.key === 'F2') {
    // already editing
  }
}

function editInputHandler(e) {
  document.getElementById('formula-input').value = e.target.value;
  const v = e.target.value;
  // Function hint
  const fnMatch = v.match(/=?([A-Z]+)\s*\(([^)]*)$/i);
  if (fnMatch) {
    const fnName = fnMatch[1].toUpperCase();
    if (FUNCTIONS[fnName]) showFnHint(fnName);
    else hideFnHint();
  } else hideFnHint();
}

function moveSelection(dr, dc, toEnd) {
  let r = sel.r + dr, c = sel.c + dc;
  r = Math.max(1, Math.min(ROWS, r));
  c = Math.max(1, Math.min(COLS, c));
  sel = { r, c, r2: r, c2: c };
  updateUIFromSel();
  scrollToCell(r, c);
}

function scrollToCell(r, c) {
  const el = document.getElementById('c-' + r + '-' + c);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ─── KEYBOARD NAVIGATION ───
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.id !== 'formula-input') return;
  if (e.target.id === 'formula-input') {
    if (e.key === 'Enter') { e.preventDefault(); applyFormulaBar(); }
    if (e.key === 'Escape') { e.preventDefault(); document.getElementById('formula-input').value = (getCell(sel.r,sel.c)||{}).raw||''; }
    return;
  }
  if (document.querySelector('.modal-overlay.open')) return;
  if (editCell) return;

  if (e.ctrlKey || e.metaKey) {
    switch(e.key.toLowerCase()) {
      case 's': e.preventDefault(); saveWorkbook(); break;
      case 'o': e.preventDefault(); openFile(); break;
      case 'n': e.preventDefault(); newWorkbook(); break;
      case 'c': e.preventDefault(); ctxCopy(); break;
      case 'x': e.preventDefault(); ctxCut(); break;
      case 'v': e.preventDefault(); ctxPaste(); break;
      case 'z': e.preventDefault(); undoAct(); break;
      case 'y': e.preventDefault(); redoAct(); break;
      case 'f': e.preventDefault(); openFindPanel(); break;
      case 'h': e.preventDefault(); openFindReplacePanel(); break;
      case 'a': e.preventDefault(); selectAll(); break;
      case 'b': e.preventDefault(); applyFmt('bold'); break;
      case 'i': e.preventDefault(); applyFmt('italic'); break;
      case 'u': e.preventDefault(); applyFmt('underline'); break;
      case 'home': e.preventDefault(); sel={r:1,c:1,r2:1,c2:1}; updateUIFromSel(); scrollToCell(1,1); break;
      case 'end': e.preventDefault(); break;
    }
    return;
  }

  switch(e.key) {
    case 'ArrowUp': e.preventDefault(); if(e.shiftKey){sel.r2=Math.max(1,sel.r2-1);}else{moveSelection(-1,0);} updateUIFromSel(); break;
    case 'ArrowDown': e.preventDefault(); if(e.shiftKey){sel.r2=Math.min(ROWS,sel.r2+1);}else{moveSelection(1,0);} updateUIFromSel(); break;
    case 'ArrowLeft': e.preventDefault(); if(e.shiftKey){sel.c2=Math.max(1,sel.c2-1);}else{moveSelection(0,-1);} updateUIFromSel(); break;
    case 'ArrowRight': e.preventDefault(); if(e.shiftKey){sel.c2=Math.min(COLS,sel.c2+1);}else{moveSelection(0,1);} updateUIFromSel(); break;
    case 'Tab': e.preventDefault(); moveSelection(0,e.shiftKey?-1:1); break;
    case 'Enter': e.preventDefault(); moveSelection(1,0); break;
    case 'Delete': case 'Backspace': e.preventDefault(); clearCells(); break;
    case 'F2': startEdit(sel.r, sel.c); break;
    case 'Escape': cancelEdit(); break;
    case 'Home': sel.c=1; sel.c2=1; updateUIFromSel(); break;
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        startEdit(sel.r, sel.c, e.key);
      }
  }
});

// ─── FORMULA BAR INTERACTION ───
function applyFormulaBar() {
  const val = document.getElementById('formula-input').value;
  saveUndoState();
  const cd = getCell(sel.r, sel.c) || {};
  cd.raw = val;
  if (String(val).startsWith('=')) cd.calc = evalFormula(val, sel.r, sel.c);
  else delete cd.calc;
  setCell(sel.r, sel.c, val===''&&!cd.fmt ? null : cd);
  renderCell(document.getElementById('c-'+sel.r+'-'+sel.c), sel.r, sel.c);
  document.getElementById('formula-input').value = val;
}

function formulaKeydown(e) {
  if (e.key === 'Enter') applyFormulaBar();
}
function formulaInput(e) {
  const v = e.target.value;
  const fnMatch = v.match(/([A-Z]+)\s*\(([^)]*)$/i);
  if (fnMatch) showFnHint(fnMatch[1].toUpperCase());
  else hideFnHint();
}
function nameBoxNav(e) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim().toUpperCase();
    const ref = parseRef(val);
    if (ref) { sel={r:ref.r,c:ref.c,r2:ref.r,c2:ref.c}; updateUIFromSel(); scrollToCell(ref.r,ref.c); }
    else {
      const rr = parseRange(val);
      if (rr) { sel={r:rr.r1,c:rr.c1,r2:rr.r2,c2:rr.c2}; updateUIFromSel(); }
    }
    document.getElementById('c-'+sel.r+'-'+sel.c)?.focus();
  }
}

// ─── FORMATTING ───
function applyFmt(type, val) {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    const cd = getCell(r,c) || {};
    if (!cd.fmt) cd.fmt = {};
    switch(type) {
      case 'bold': cd.fmt.bold = !cd.fmt.bold; break;
      case 'italic': cd.fmt.italic = !cd.fmt.italic; break;
      case 'underline': cd.fmt.underline = !cd.fmt.underline; break;
      case 'strike': cd.fmt.strike = !cd.fmt.strike; break;
      case 'align': cd.fmt.align = val; break;
      case 'valign': cd.fmt.valign = val; break;
      case 'font': cd.fmt.font = val; break;
      case 'fontSize': cd.fmt.fontSize = parseInt(val); break;
      case 'color': cd.fmt.color = val; document.getElementById('fc-strip').style.background = val; break;
      case 'bg': cd.fmt.bg = val; document.getElementById('bc-strip').style.background = val; break;
      case 'wrap': cd.fmt.wrap = !cd.fmt.wrap; break;
    }
    setCell(r, c, cd);
  }
  renderGrid();
  updateRibbonState();
}

function applyNumFmt(fmt) {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    const cd = getCell(r,c) || { raw: '' };
    if (!cd.fmt) cd.fmt = {};
    cd.fmt.numFmt = fmt;
    setCell(r, c, cd);
  }
  renderGrid();
  closeAllDropdowns();
}

function incDecimals() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  for (let r=r1;r<=Math.max(sel.r,sel.r2);r++) for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd = getCell(r,c)||{raw:''};
    if (!cd.fmt) cd.fmt={};
    cd.fmt.dec = (cd.fmt.dec||2) + 1;
    setCell(r,c,cd);
  }
  renderGrid();
}
function decDecimals() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  for (let r=r1;r<=Math.max(sel.r,sel.r2);r++) for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd = getCell(r,c)||{raw:''};
    if (!cd.fmt) cd.fmt={};
    cd.fmt.dec = Math.max(0,(cd.fmt.dec||2) - 1);
    setCell(r,c,cd);
  }
  renderGrid();
}

function applyBorder(type) {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    const cd = getCell(r,c)||{raw:''};
    if (!cd.fmt) cd.fmt={};
    if (!cd.fmt.border) cd.fmt.border={};
    const bStyle = '1px solid #333';
    const bThick = '2px solid #000';
    const bNone = 'none';
    switch(type) {
      case 'all': cd.fmt.border = {top:bStyle,bottom:bStyle,left:bStyle,right:bStyle}; break;
      case 'outside':
        if (r===r1) cd.fmt.border.top=bStyle;
        if (r===r2) cd.fmt.border.bottom=bStyle;
        if (c===c1) cd.fmt.border.left=bStyle;
        if (c===c2) cd.fmt.border.right=bStyle;
        break;
      case 'thick':
        if (r===r1) cd.fmt.border.top=bThick;
        if (r===r2) cd.fmt.border.bottom=bThick;
        if (c===c1) cd.fmt.border.left=bThick;
        if (c===c2) cd.fmt.border.right=bThick;
        break;
      case 'none': cd.fmt.border={}; break;
      case 'bottom': cd.fmt.border.bottom=bStyle; break;
      case 'top': cd.fmt.border.top=bStyle; break;
      case 'left': cd.fmt.border.left=bStyle; break;
      case 'right': cd.fmt.border.right=bStyle; break;
    }
    setCell(r,c,cd);
  }
  renderGrid();
  closeAllDropdowns();
}

function applyStyle(style) {
  const styles = {
    good: {color:'#276221',bg:'#c6efce',bold:true},
    bad: {color:'#9c0006',bg:'#ffc7ce',bold:true},
    neutral: {color:'#9c6500',bg:'#ffeb9c'},
    header: {color:'white',bg:'#1e7e45',bold:true},
    title: {color:'#1e7e45',bold:true,fontSize:14},
    total: {color:'#000',bold:true,border:{top:'2px solid #333',bottom:'2px double #333'}},
  };
  const s = styles[style];
  if (!s) return;
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  for (let r=r1;r<=Math.max(sel.r,sel.r2);r++) for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd = getCell(r,c)||{raw:''};
    cd.fmt = Object.assign(cd.fmt||{}, s);
    setCell(r,c,cd);
  }
  renderGrid();
  closeAllDropdowns();
}

function mergeCells() {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  // Get value of top-left
  const topLeft = getCell(r1,c1);
  const val = topLeft ? topLeft.raw : '';
  // Clear all others
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    if (r===r1&&c===c1) continue;
    setCell(r,c,null);
    const el = document.getElementById('c-'+r+'-'+c);
    if (el) { el.style.display='none'; }
  }
  // Set colspan on top-left
  const el = document.getElementById('c-'+r1+'-'+c1);
  if (el) {
    el.style.minWidth = (c2-c1+1)*COL_W + 'px';
    el.style.maxWidth = (c2-c1+1)*COL_W + 'px';
    el.style.width = (c2-c1+1)*COL_W + 'px';
  }
  sheet().merges.push({r1,c1,r2,c2});
  renderGrid();
}

function incIndent() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  for (let r=r1;r<=Math.max(sel.r,sel.r2);r++) for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd = getCell(r,c)||{raw:''}; if(!cd.fmt)cd.fmt={};
    cd.fmt.indent = (cd.fmt.indent||0)+1; setCell(r,c,cd);
  }
  renderGrid();
}
function decIndent() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  for (let r=r1;r<=Math.max(sel.r,sel.r2);r++) for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd = getCell(r,c)||{raw:''}; if(!cd.fmt)cd.fmt={};
    cd.fmt.indent = Math.max(0,(cd.fmt.indent||0)-1); setCell(r,c,cd);
  }
  renderGrid();
}

// ─── CELL OPERATIONS ───
function clearCells() {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  for (let r=r1;r<=Math.max(sel.r,sel.r2);r++) for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd = getCell(r,c);
    if (cd) { cd.raw = ''; delete cd.calc; setCell(r,c, cd.fmt ? cd : null); }
  }
  renderGrid();
}

function autoSum() {
  // Find range above or to the left
  let r = sel.r, c = sel.c;
  let formula = '=SUM(';
  // Check above
  let top = r-1;
  while (top >= 1 && getCellValue(top, c) !== '') top--;
  if (top < r-1) {
    formula += cellRef(top+1, c) + ':' + cellRef(r-1, c) + ')';
  } else {
    // Check left
    let left = c-1;
    while (left >= 1 && getCellValue(r, left) !== '') left--;
    formula += cellRef(r, left+1) + ':' + cellRef(r, c-1) + ')';
  }
  startEdit(r, c, formula);
}

function insertFn(name) {
  const syntax = FN_INFO[name] ? '=' + FN_INFO[name].syntax : '=' + name + '()';
  startEdit(sel.r, sel.c, syntax);
}

// ─── ROW/COLUMN OPERATIONS ───
function insertRowAbove() {
  saveUndoState();
  const r = Math.min(sel.r, sel.r2);
  const sh = sheet();
  const newCells = {};
  Object.keys(sh.cells).forEach(k => {
    const [cr, cc] = k.split(',').map(Number);
    if (cr >= r) newCells[(cr+1)+','+cc] = sh.cells[k];
    else newCells[k] = sh.cells[k];
  });
  sh.cells = newCells;
  initGrid();
}
function insertRowBelow() {
  saveUndoState();
  const r = Math.max(sel.r, sel.r2);
  const sh = sheet();
  const newCells = {};
  Object.keys(sh.cells).forEach(k => {
    const [cr, cc] = k.split(',').map(Number);
    if (cr > r) newCells[(cr+1)+','+cc] = sh.cells[k];
    else newCells[k] = sh.cells[k];
  });
  sh.cells = newCells;
  initGrid();
}
function insertColLeft() {
  saveUndoState();
  const c = Math.min(sel.c, sel.c2);
  const sh = sheet();
  const newCells = {};
  Object.keys(sh.cells).forEach(k => {
    const [cr, cc] = k.split(',').map(Number);
    if (cc >= c) newCells[cr+','+(cc+1)] = sh.cells[k];
    else newCells[k] = sh.cells[k];
  });
  sh.cells = newCells;
  initGrid();
}
function insertColRight() {
  saveUndoState();
  const c = Math.max(sel.c, sel.c2);
  const sh = sheet();
  const newCells = {};
  Object.keys(sh.cells).forEach(k => {
    const [cr, cc] = k.split(',').map(Number);
    if (cc > c) newCells[cr+','+(cc+1)] = sh.cells[k];
    else newCells[k] = sh.cells[k];
  });
  sh.cells = newCells;
  initGrid();
}
function deleteSelectedRows() {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2), r2=Math.max(sel.r,sel.r2), count=r2-r1+1;
  const sh = sheet();
  const newCells = {};
  Object.keys(sh.cells).forEach(k => {
    const [cr, cc] = k.split(',').map(Number);
    if (cr < r1) newCells[k] = sh.cells[k];
    else if (cr > r2) newCells[(cr-count)+','+cc] = sh.cells[k];
  });
  sh.cells = newCells;
  sel = {r:r1,c:sel.c,r2:r1,c2:sel.c};
  initGrid();
}
function deleteSelectedCols() {
  saveUndoState();
  const c1=Math.min(sel.c,sel.c2), c2=Math.max(sel.c,sel.c2), count=c2-c1+1;
  const sh = sheet();
  const newCells = {};
  Object.keys(sh.cells).forEach(k => {
    const [cr, cc] = k.split(',').map(Number);
    if (cc < c1) newCells[k] = sh.cells[k];
    else if (cc > c2) newCells[cr+','+(cc-count)] = sh.cells[k];
  });
  sh.cells = newCells;
  sel = {r:sel.r,c:c1,r2:sel.r2,c2:c1};
  initGrid();
}
function autoFitCol() { autoFitColN(sel.c); }
function autoFitColN(c) {
  const sh = sheet();
  let maxW = 40;
  for (let r=1; r<=ROWS; r++) {
    const cd = getCell(r, c, sh);
    if (cd && cd.raw) {
      const len = String(cd.raw).length * 8;
      if (len > maxW) maxW = len;
    }
  }
  sh.colWidths[c] = Math.min(400, maxW + 16);
  renderGrid();
}

// ─── CLIPBOARD ───
function ctxCopy() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  copyBuf = { r1,c1,r2,c2, cells:{}, cut:false };
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    copyBuf.cells[cellKey(r-r1,c-c1)] = JSON.parse(JSON.stringify(getCell(r,c)||{}));
  }
  // Copy to clipboard as text
  let txt = '';
  for (let r=r1;r<=r2;r++) {
    const row = [];
    for (let c=c1;c<=c2;c++) row.push(getCellValue(r,c)||'');
    txt += row.join('\t') + '\n';
  }
  navigator.clipboard.writeText(txt).catch(()=>{});
  // Show copy dashes
  showCopyDash();
}
function ctxCut() {
  ctxCopy();
  copyBuf.cut = true;
}
function ctxPaste() {
  if (!copyBuf) {
    // Try clipboard text
    navigator.clipboard.readText().then(txt => {
      if (!txt) return;
      saveUndoState();
      const rows = txt.split('\n').filter(r=>r);
      rows.forEach((row, ri) => {
        row.split('\t').forEach((val, ci) => {
          const r = sel.r + ri, c = sel.c + ci;
          if (r > ROWS || c > COLS) return;
          const cd = getCell(r,c)||{};
          cd.raw = val;
          if (String(val).startsWith('=')) cd.calc = evalFormula(val, r, c);
          setCell(r, c, val?cd:null);
        });
      });
      renderGrid();
    }).catch(()=>{});
    return;
  }
  saveUndoState();
  const dr = sel.r - copyBuf.r1, dc = sel.c - copyBuf.c1;
  const rh = copyBuf.r2 - copyBuf.r1, cw = copyBuf.c2 - copyBuf.c1;
  for (let r=0;r<=rh;r++) for (let c=0;c<=cw;c++) {
    const td = sel.r + r, tc = sel.c + c;
    if (td > ROWS || tc > COLS) continue;
    const src = copyBuf.cells[cellKey(r,c)];
    const cd = src ? JSON.parse(JSON.stringify(src)) : null;
    if (cd && cd.raw && String(cd.raw).startsWith('=')) {
      // Adjust references
      cd.raw = adjustFormula(cd.raw, dr, dc);
      cd.calc = evalFormula(cd.raw, td, tc);
    }
    setCell(td, tc, cd);
  }
  if (copyBuf.cut) {
    for (let r=copyBuf.r1;r<=copyBuf.r2;r++) for (let c=copyBuf.c1;c<=copyBuf.c2;c++) setCell(r,c,null);
    copyBuf = null;
    hideCopyDash();
  }
  renderGrid();
}
function ctxPasteSpecial() {
  if (!copyBuf) return;
  document.getElementById('modal-paste-special').classList.add('open');
}
function doPasteSpecial() {
  if (!copyBuf) { closeModal('modal-paste-special'); return; }
  const what = document.querySelector('input[name="ps-what"]:checked').value;
  const op = document.getElementById('ps-op').value;
  const transpose = document.getElementById('ps-transpose').checked;
  saveUndoState();
  const rh = copyBuf.r2-copyBuf.r1, cw = copyBuf.c2-copyBuf.c1;
  for (let r=0;r<=rh;r++) for (let c=0;c<=cw;c++) {
    const tr = sel.r + (transpose?c:r), tc = sel.c + (transpose?r:c);
    if (tr>ROWS||tc>COLS) continue;
    const src = copyBuf.cells[cellKey(r,c)];
    const tgt = getCell(tr,tc) || {};
    if (!src) continue;
    if (what==='values' || what==='all') {
      let v = src.calc!==undefined ? src.calc : src.raw;
      if (op !== 'none') {
        const ov = parseFloat(getCellValue(tr,tc))||0;
        v = parseFloat(v)||0;
        if (op==='add') v = ov+v;
        else if (op==='sub') v = ov-v;
        else if (op==='mul') v = ov*v;
        else if (op==='div') v = v!==0?ov/v:'#DIV/0!';
      }
      tgt.raw = String(v);
      delete tgt.calc;
    }
    if (what==='formats' || what==='all') tgt.fmt = src.fmt ? JSON.parse(JSON.stringify(src.fmt)) : {};
    if (what==='formulas') { tgt.raw = src.raw; tgt.calc = src.calc; }
    setCell(tr, tc, tgt);
  }
  closeModal('modal-paste-special');
  renderGrid();
}

function adjustFormula(formula, dr, dc) {
  return formula.replace(/\$?([A-Z]{1,2})\$?(\d+)/g, (m, col, row) => {
    const newR = parseInt(row) + dr;
    const newC = col.split('').reduce((a,ch)=>a*26+(ch.charCodeAt(0)-64),0) + dc;
    if (newR < 1 || newC < 1) return '#REF!';
    return colLetter(newC) + newR;
  });
}

function showCopyDash() {
  const r1=copyBuf.r1,c1=copyBuf.c1,r2=copyBuf.r2,c2=copyBuf.c2;
  const el1 = document.getElementById('c-'+r1+'-'+c1);
  const el2 = document.getElementById('c-'+r2+'-'+c2);
  const dash = document.getElementById('copy-dash');
  if (!el1||!el2) return;
  const cont = document.getElementById('grid-container').getBoundingClientRect();
  const t = el1.getBoundingClientRect();
  const b = el2.getBoundingClientRect();
  dash.style.display = '';
  dash.style.left = (t.left-cont.left) + 'px';
  dash.style.top = (t.top-cont.top+document.getElementById('grid-scroll').scrollTop) + 'px';
  dash.style.width = (b.right-t.left) + 'px';
  dash.style.height = (b.bottom-t.top) + 'px';
}
function hideCopyDash() { document.getElementById('copy-dash').style.display='none'; }

// ─── UNDO/REDO ───
function saveUndoState() {
  const sh = sheet();
  undoStack.push({ cells: JSON.stringify(sh.cells), sheet: wb.activeSheet });
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}
function undoAct() {
  if (!undoStack.length) return;
  const cur = { cells: JSON.stringify(sheet().cells), sheet: wb.activeSheet };
  redoStack.push(cur);
  const prev = undoStack.pop();
  wb.sheets[prev.sheet].cells = JSON.parse(prev.cells);
  renderGrid();
}
function redoAct() {
  if (!redoStack.length) return;
  saveUndoState();
  const next = redoStack.pop();
  wb.sheets[next.sheet].cells = JSON.parse(next.cells);
  renderGrid();
}

// ─── SORT ───
function sortRange(dir) {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  const sortC = sel.c;
  const rows = [];
  for (let r=r1;r<=r2;r++) {
    const row = [];
    for (let c=c1;c<=c2;c++) row.push(getCell(r,c));
    rows.push(row);
  }
  rows.sort((a,b) => {
    const va = (a[sortC-c1]||{}).raw || '';
    const vb = (b[sortC-c1]||{}).raw || '';
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) return dir==='asc' ? na-nb : nb-na;
    return dir==='asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  rows.forEach((row, ri) => {
    row.forEach((cd, ci) => setCell(r1+ri, c1+ci, cd));
  });
  renderGrid();
}

function openSortModal() {
  document.getElementById('sort-levels').innerHTML = '';
  addSortLevel();
  document.getElementById('modal-sort').classList.add('open');
}
function addSortLevel() {
  const div = document.createElement('div');
  div.className = 'frow fg';
  div.innerHTML = `
    <div class="fg"><label class="fl">Colonne</label><select class="fc" style="width:80px">${Array.from({length:COLS},(v,i)=>`<option value="${i+1}">${colLetter(i+1)}</option>`).join('')}</select></div>
    <div class="fg"><label class="fl">Ordre</label><select class="fc" style="width:100px"><option value="asc">A → Z</option><option value="desc">Z → A</option></select></div>
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()" style="align-self:flex-end">✕</button>
  `;
  document.getElementById('sort-levels').appendChild(div);
}
function doSort() {
  saveUndoState();
  const levels = Array.from(document.getElementById('sort-levels').children).map(div => {
    const sels = div.querySelectorAll('select');
    return { col: parseInt(sels[0].value), dir: sels[1].value };
  });
  const hasHeader = document.getElementById('sort-header').checked;
  const r1=Math.min(sel.r,sel.r2)+(hasHeader?1:0), c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2), c2=Math.max(sel.c,sel.c2);
  const rows = [];
  for (let r=r1;r<=r2;r++) {
    const row = [];
    for (let c=c1;c<=c2;c++) row.push(getCell(r,c));
    rows.push(row);
  }
  rows.sort((a,b) => {
    for (const {col, dir} of levels) {
      const va = (a[col-c1]||{}).raw||'';
      const vb = (b[col-c1]||{}).raw||'';
      const na=parseFloat(va),nb=parseFloat(vb);
      let cmp = !isNaN(na)&&!isNaN(nb) ? na-nb : String(va).localeCompare(String(vb));
      if (dir==='desc') cmp=-cmp;
      if (cmp!==0) return cmp;
    }
    return 0;
  });
  rows.forEach((row,ri) => row.forEach((cd,ci) => setCell(r1+ri,c1+ci,cd)));
  closeModal('modal-sort');
  renderGrid();
}

// ─── FILTER ───
function toggleAutoFilter() {
  activeFilters = !activeFilters;
  document.getElementById('rb-filter')?.classList.toggle('pressed', activeFilters);
  renderGrid();
  updateFilterIndicators();
}

function updateFilterIndicators() {
  // Add/remove filter dropdowns on column headers
  document.querySelectorAll('.col-header').forEach(ch => {
    let btn = ch.querySelector('.filter-btn');
    if (activeFilters) {
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.innerHTML = '▾';
        btn.style.cssText = 'position:absolute;right:2px;bottom:2px;background:none;border:1px solid var(--border);border-radius:2px;font-size:9px;cursor:pointer;padding:0 2px;color:var(--green);';
        const c = parseInt(ch.id.replace('ch-',''));
        btn.onclick = (e) => { e.stopPropagation(); openFilterDropdown(c, e.target); };
        ch.style.position = 'relative';
        ch.appendChild(btn);
      }
    } else if (btn) btn.remove();
  });
}

function openFilterDropdown(c, btn) {
  // Close any existing
  document.querySelectorAll('.filter-dropdown').forEach(d=>d.remove());
  const sh = sheet();
  const vals = new Set();
  for (let r=2;r<=ROWS;r++) {
    const v = getCellValue(r,c,sh);
    if (v !== '') vals.add(String(v));
  }
  const dd = document.createElement('div');
  dd.className = 'filter-dropdown open';
  dd.innerHTML = `<div style="font-size:11px;font-weight:600;margin-bottom:6px">Filtrer par valeur</div>
    <label class="fcheck" style="font-size:11px"><input type="checkbox" id="fa-all" checked onchange="filterAll(${c},this)"> (Tout sélectionner)</label>
    ${Array.from(vals).sort().map(v=>`<label class="fcheck" style="font-size:11px"><input type="checkbox" class="fa-val" value="${v}" checked> ${v}</label>`).join('')}
    <div style="display:flex;gap:4px;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="applyFilter(${c})">OK</button><button class="btn btn-sm" onclick="this.closest('.filter-dropdown').remove()">Annuler</button></div>`;
  const rect = btn.getBoundingClientRect();
  dd.style.cssText += `position:fixed;left:${rect.left}px;top:${rect.bottom}px;`;
  document.body.appendChild(dd);
  document.addEventListener('click', function onClickOff(e) {
    if (!dd.contains(e.target) && e.target !== btn) { dd.remove(); document.removeEventListener('click', onClickOff); }
  }, true);
}

function filterAll(c, cb) {
  document.querySelectorAll('.fa-val').forEach(i => i.checked = cb.checked);
}

function applyFilter(c) {
  const sh = sheet();
  const checked = new Set(Array.from(document.querySelectorAll('.fa-val:checked')).map(i=>i.value));
  for (let r=2; r<=ROWS; r++) {
    const v = String(getCellValue(r, c, sh)||'');
    const rowEl = document.getElementById('row-'+r);
    if (rowEl) rowEl.style.display = checked.has(v) || v==='' ? '' : 'none';
  }
  document.querySelectorAll('.filter-dropdown').forEach(d=>d.remove());
}

function clearFilters() {
  for (let r=1;r<=ROWS;r++) {
    const el = document.getElementById('row-'+r);
    if (el) el.style.display = '';
  }
  sheet().filters = {};
}

function removeDuplicates() {
  saveUndoState();
  const c1=Math.min(sel.c,sel.c2), c2=Math.max(sel.c,sel.c2);
  const r1=Math.min(sel.r,sel.r2)+1, r2=Math.max(sel.r,sel.r2);
  const seen = new Set();
  const toDelete = [];
  for (let r=r1;r<=r2;r++) {
    const key = [];
    for (let c=c1;c<=c2;c++) key.push(getCellValue(r,c)||'');
    const k = key.join('|');
    if (seen.has(k)) toDelete.push(r);
    else seen.add(k);
  }
  toDelete.reverse().forEach(r => {
    const rowEl = document.getElementById('row-'+r);
    if (rowEl) rowEl.style.display='none';
    for (let c=1;c<=COLS;c++) setCell(r,c,null);
  });
  alert(`${toDelete.length} doublon(s) supprimé(s).`);
  renderGrid();
}

function openAdvancedFilter() {
  const q = prompt('Filtre avancé – entrez une valeur ou condition (ex: >100, texte*):','');
  if (!q) return;
  const c = sel.c;
  for (let r=2;r<=ROWS;r++) {
    const v = getCellValue(r,c)||'';
    const show = matchCriteria(v, q);
    const el = document.getElementById('row-'+r);
    if (el) el.style.display = show ? '' : 'none';
  }
}

// ─── DATA VALIDATION ───
function openDataValidationModal() {
  document.getElementById('modal-dv').classList.add('open');
}
function updateDVPanel() {
  const t = document.getElementById('dv-type').value;
  document.getElementById('dv-panel').style.display = t==='any' ? 'none' : '';
}
function applyDV() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  const rule = {
    type: document.getElementById('dv-type').value,
    cond: document.getElementById('dv-cond').value,
    min: document.getElementById('dv-min').value,
    max: document.getElementById('dv-max').value,
    errmsg: document.getElementById('dv-errmsg').value,
    dropdown: document.getElementById('dv-dropdown').checked,
  };
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) sheet().dv[cellKey(r,c)] = rule;
  closeModal('modal-dv');
  // Add dropdown indicator if list type
  if (rule.type === 'list' && rule.dropdown) {
    for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
      const el = document.getElementById('c-'+r+'-'+c);
      if (el && !el.querySelector('.dv-arrow')) {
        const arrow = document.createElement('div');
        arrow.className = 'dv-arrow';
        arrow.style.cssText = 'position:absolute;right:2px;font-size:9px;cursor:pointer;color:var(--gray-500);';
        arrow.textContent = '▾';
        arrow.onclick = (e) => { e.stopPropagation(); showDVDropdown(r, c, rule, arrow); };
        el.style.position = 'relative';
        el.appendChild(arrow);
      }
    }
  }
}
function showDVDropdown(r, c, rule, btn) {
  document.querySelectorAll('.dv-dd').forEach(d=>d.remove());
  const items = rule.min.split(',');
  const dd = document.createElement('div');
  dd.className = 'dv-dd filter-dropdown open';
  dd.innerHTML = items.map(v=>`<div class="dd-it" onclick="setCellFromDV(${r},${c},'${v}')">${v}</div>`).join('');
  const rect = btn.getBoundingClientRect();
  dd.style.cssText += `position:fixed;left:${rect.left}px;top:${rect.bottom}px;`;
  document.body.appendChild(dd);
}
function setCellFromDV(r, c, v) {
  saveUndoState();
  const cd = getCell(r,c)||{}; cd.raw=v; setCell(r,c,cd); renderGrid();
  document.querySelectorAll('.dv-dd').forEach(d=>d.remove());
}

// ─── CONDITIONAL FORMATTING ───
function openCondFmtModal() { document.getElementById('modal-cf').classList.add('open'); }
function applyCF() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  const rule = {
    r1,c1,r2,c2,
    type: document.getElementById('cf-rule').value,
    val1: document.getElementById('cf-val1').value,
    val2: document.getElementById('cf-val2').value,
    color: document.getElementById('cf-color').value,
    bg: document.getElementById('cf-bg-color').value,
  };
  sheet().cf.push(rule);
  closeModal('modal-cf');
  applyCFAll();
}
function applyCFAll() {
  const sh = sheet();
  sh.cf.forEach(rule => {
    for (let r=rule.r1;r<=rule.r2;r++) for (let c=rule.c1;c<=rule.c2;c++) {
      const el = document.getElementById('c-'+r+'-'+c);
      if (!el) continue;
      const v = parseFloat(getCellValue(r,c,sh))||0;
      let match = false;
      switch(rule.type) {
        case 'gt': match = v > parseFloat(rule.val1); break;
        case 'lt': match = v < parseFloat(rule.val1); break;
        case 'eq': match = String(getCellValue(r,c,sh)) === String(rule.val1); break;
        case 'between': match = v >= parseFloat(rule.val1) && v <= parseFloat(rule.val2); break;
        case 'contains': match = String(getCellValue(r,c,sh)).includes(rule.val1); break;
        case 'databars':
          // Add data bar
          const allVals = []; for(let rr=rule.r1;rr<=rule.r2;rr++) allVals.push(parseFloat(getCellValue(rr,c,sh))||0);
          const maxV = Math.max(...allVals), minV = Math.min(...allVals);
          const pct = maxV>minV ? (v-minV)/(maxV-minV)*100 : 50;
          el.style.background = `linear-gradient(to right, ${rule.bg} ${pct}%, transparent ${pct}%)`;
          continue;
        case 'colorscale':
          const allV2=[]; for(let rr=rule.r1;rr<=rule.r2;rr++) allV2.push(parseFloat(getCellValue(rr,c,sh))||0);
          const mx=Math.max(...allV2),mn=Math.min(...allV2);
          const t=(v-mn)/(mx-mn||1);
          el.style.background = `hsl(${120-t*120},70%,75%)`;
          continue;
      }
      if (match) { el.style.color = rule.color; el.style.background = rule.bg; }
    }
  });
}

// ─── CHARTS ───
let chartCount = 0;
function insertChart(type) {
  closeAllDropdowns();
  chartCount++;
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);

  // Collect data
  const labels = [];
  const datasets = [];
  const COLORS = ['#1e7e45','#2196F3','#FF5722','#9C27B0','#FF9800','#00BCD4','#E91E63','#4CAF50'];

  // First column as labels if multiple columns
  if (c2 > c1) {
    for (let r=r1;r<=r2;r++) labels.push(String(getCellValue(r,c1)||r));
    for (let c=c1+1;c<=c2;c++) {
      const data = [];
      for (let r=r1;r<=r2;r++) data.push(parseFloat(getCellValue(r,c))||0);
      datasets.push({ label: colLetter(c), data, backgroundColor: COLORS[(c-c1-1)%COLORS.length], borderColor: COLORS[(c-c1-1)%COLORS.length], fill: false, tension: 0.4 });
    }
  } else {
    for (let r=r1;r<=r2;r++) {
      labels.push(cellRef(r,c1));
      const v = parseFloat(getCellValue(r,c1))||0;
      datasets.push({ data: [v] });
    }
    // Consolidate
    const d = []; for(let r=r1;r<=r2;r++) { labels[r-r1]=String(getCellValue(r,c1)||r); d.push(parseFloat(getCellValue(r,c1))||0); }
    datasets.length = 0;
    datasets.push({ label: 'Données', data: d, backgroundColor: COLORS, borderColor: COLORS.map(c=>c+'cc'), borderWidth: 1, fill: true, tension: 0.4 });
  }

  const win = document.createElement('div');
  win.className = 'chart-win';
  win.style.cssText = `left:${150+chartCount*20}px;top:${100+chartCount*20}px;width:400px;height:300px;`;
  win.innerHTML = `
    <div class="chart-titlebar" id="cwt-${chartCount}">
      <span>Graphique ${chartCount} – ${type}</span>
      <div style="display:flex;gap:4px">
        <select style="font-size:10px;padding:1px 3px;border-radius:3px;border:none;" onchange="changeChartType(${chartCount},this.value)">
          <option value="bar" ${type==='bar'?'selected':''}>Barres</option>
          <option value="line" ${type==='line'?'selected':''}>Courbes</option>
          <option value="pie" ${type==='pie'?'selected':''}>Secteurs</option>
          <option value="doughnut" ${type==='doughnut'?'selected':''}>Anneau</option>
          <option value="scatter" ${type==='scatter'?'selected':''}>Nuage</option>
          <option value="area" ${type==='area'?'selected':''}>Aires</option>
          <option value="radar" ${type==='radar'?'selected':''}>Radar</option>
        </select>
        <button class="chart-close-btn" onclick="this.closest('.chart-win').remove()">×</button>
      </div>
    </div>
    <div class="chart-body" style="height:calc(100% - 32px)"><canvas id="chart-canvas-${chartCount}"></canvas></div>
  `;
  document.getElementById('grid-wrapper').appendChild(win);
  makeDraggable(win, win.querySelector('.chart-titlebar'));
  makeResizable(win);

  const chartType = type === 'area' ? 'line' : type;
  const isArea = type === 'area';
  if (isArea) datasets.forEach(d => d.fill = true);

  new Chart(document.getElementById('chart-canvas-'+chartCount), {
    type: chartType,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { family: 'IBM Plex Sans', size: 11 } } } },
      scales: (chartType==='pie'||chartType==='doughnut'||chartType==='radar'||chartType==='polarArea') ? {} : {
        x: { ticks: { font: { family: 'IBM Plex Sans', size: 10 } } },
        y: { ticks: { font: { family: 'IBM Plex Sans', size: 10 } } },
      }
    }
  });
}

function changeChartType(id, type) {
  const canvas = document.getElementById('chart-canvas-'+id);
  const chart = Chart.getChart(canvas);
  if (chart) { chart.config.type = type==='area'?'line':type; chart.update(); }
}

function makeDraggable(el, handle) {
  let mx, my, ox, oy;
  (handle||el).onmousedown = function(e) {
    if (e.target.tagName==='SELECT'||e.target.tagName==='BUTTON') return;
    mx=e.clientX; my=e.clientY;
    ox=parseInt(el.style.left)||0; oy=parseInt(el.style.top)||0;
    const onMove = (e) => { el.style.left=(ox+e.clientX-mx)+'px'; el.style.top=(oy+e.clientY-my)+'px'; };
    const onUp = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  };
}
function makeResizable(el) {
  const handle = document.createElement('div');
  handle.style.cssText = 'position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:se-resize;background:rgba(0,0,0,.1);border-radius:0 0 5px 0;';
  el.appendChild(handle);
  let sx,sy,sw,sh2;
  handle.onmousedown = (e) => {
    e.preventDefault(); sx=e.clientX; sy=e.clientY; sw=el.offsetWidth; sh2=el.offsetHeight;
    const onMove = (e) => { el.style.width=Math.max(200,sw+e.clientX-sx)+'px'; el.style.height=Math.max(150,sh2+e.clientY-sy)+'px'; };
    const onUp = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  };
}

function insertSparkline() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  const data = [];
  for (let c=c1;c<=c2;c++) data.push(parseFloat(getCellValue(r1,c))||0);
  // Draw sparkline in a cell to the right of selection
  const targetC = c2+1;
  const el = document.getElementById('c-'+r1+'-'+targetC);
  if (!el) return;
  const canvas = document.createElement('canvas');
  canvas.width = COL_W-4; canvas.height = ROW_H-4;
  canvas.style.cssText = 'position:absolute;left:2px;top:2px;';
  el.style.position = 'relative';
  el.innerHTML = '';
  el.appendChild(canvas);
  new Chart(canvas, { type:'line', data:{ labels:data.map((_,i)=>i), datasets:[{data,borderColor:'#1e7e45',borderWidth:1.5,pointRadius:0,fill:false,tension:0.4}]}, options:{plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false}},animation:false}});
}

// ─── PIVOT TABLE ───
function insertPivotTable() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  // Add new sheet for pivot
  const pivotSheet = createSheet('Pivot' + (wb.sheets.length));
  wb.sheets.push(pivotSheet);
  // Simple pivot: group by first col, sum second col
  const groups = {};
  for (let r=r1+1;r<=r2;r++) {
    const key = String(getCellValue(r,c1));
    const val = parseFloat(getCellValue(r,c1+1))||0;
    groups[key] = (groups[key]||0) + val;
  }
  // Headers
  pivotSheet.cells['1,1'] = {raw: getCellValue(r1,c1)||'Clé'};
  pivotSheet.cells['1,2'] = {raw: getCellValue(r1,c1+1)||'Somme'};
  let pRow = 2;
  Object.entries(groups).forEach(([k,v]) => {
    pivotSheet.cells[pRow+',1'] = {raw: k};
    pivotSheet.cells[pRow+',2'] = {raw: String(v)};
    pRow++;
  });
  // Total
  pivotSheet.cells[pRow+',1'] = {raw:'TOTAL', fmt:{bold:true}};
  pivotSheet.cells[pRow+',2'] = {raw: String(Object.values(groups).reduce((a,b)=>a+b,0)), fmt:{bold:true}};
  switchSheet(wb.sheets.length-1);
  alert('Tableau croisé créé dans la feuille "' + pivotSheet.name + '".');
}

function insertTable() {
  // Format selection as table
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  for (let c=c1;c<=c2;c++) {
    const cd = getCell(r1,c)||{raw:colLetter(c)};
    if (!cd.fmt) cd.fmt={};
    cd.fmt.bg = '#1e7e45'; cd.fmt.color = 'white'; cd.fmt.bold = true;
    setCell(r1,c,cd);
  }
  for (let r=r1+1;r<=r2;r++) {
    for (let c=c1;c<=c2;c++) {
      const cd = getCell(r,c)||{raw:''};
      if (!cd.fmt) cd.fmt={};
      cd.fmt.bg = (r-r1)%2===0 ? '#e6f4ec' : 'white';
      setCell(r,c,cd);
    }
  }
  renderGrid();
}

// ─── SHEETS ───
function switchSheet(idx) {
  wb.activeSheet = idx;
  renderSheetTabs();
  initGrid();
  sel = {r:1,c:1,r2:1,c2:1};
  updateUIFromSel();
}
function renderSheetTabs() {
  const tabs = document.getElementById('sheet-tabs');
  tabs.innerHTML = '';
  wb.sheets.forEach((sh, i) => {
    const tab = document.createElement('div');
    tab.className = 'sheet-tab' + (i===wb.activeSheet?' active':'');
    tab.innerHTML = `<span ondblclick="renameSheet(${i})">${sh.name}</span><span class="close-tab" onclick="deleteSheet(${i},event)">×</span>`;
    tab.onclick = (e) => { if (!e.target.classList.contains('close-tab')) switchSheet(i); };
    tab.oncontextmenu = (e) => { e.preventDefault(); sheetTabMenu(i, e); };
    tabs.appendChild(tab);
  });
  document.getElementById('sb-sheets').textContent = wb.sheets.length + ' feuille' + (wb.sheets.length>1?'s':'');
}
function addSheet() {
  wb.sheets.push(createSheet('Feuil' + (wb.sheets.length+1)));
  switchSheet(wb.sheets.length-1);
}
function deleteSheet(i, e) {
  e.stopPropagation();
  if (wb.sheets.length <= 1) { alert('Impossible de supprimer la dernière feuille.'); return; }
  if (!confirm('Supprimer la feuille "' + wb.sheets[i].name + '" ?')) return;
  wb.sheets.splice(i, 1);
  if (wb.activeSheet >= wb.sheets.length) wb.activeSheet = wb.sheets.length-1;
  switchSheet(wb.activeSheet);
}
function renameSheet(i) {
  const name = prompt('Renommer la feuille:', wb.sheets[i].name);
  if (name) { wb.sheets[i].name = name; renderSheetTabs(); }
}
function sheetTabMenu(i, e) {
  // Quick context menu for sheet tab
  const items = [
    ['Renommer', ()=>renameSheet(i)],
    ['Dupliquer', ()=>{ wb.sheets.splice(i+1,0,{...JSON.parse(JSON.stringify(wb.sheets[i])),name:wb.sheets[i].name+'(2)'}); renderSheetTabs(); }],
    ['Déplacer vers la gauche', ()=>{ if(i>0){[wb.sheets[i-1],wb.sheets[i]]=[wb.sheets[i],wb.sheets[i-1]]; switchSheet(i-1); } }],
    ['Déplacer vers la droite', ()=>{ if(i<wb.sheets.length-1){[wb.sheets[i+1],wb.sheets[i]]=[wb.sheets[i],wb.sheets[i+1]]; switchSheet(i+1); } }],
    ['Supprimer', ()=>deleteSheet(i,{stopPropagation:()=>{}})],
  ];
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:white;border:1px solid var(--border);border-radius:5px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:9999;padding:3px 0;`;
  items.forEach(([label, action]) => {
    const it = document.createElement('div');
    it.textContent = label;
    it.className = 'ctx-it';
    it.onclick = () => { action(); menu.remove(); };
    menu.appendChild(it);
  });
  document.body.appendChild(menu);
  setTimeout(()=>{ document.addEventListener('click',()=>menu.remove(),{once:true}); }, 50);
}

// ─── COLUMN RESIZE ───
function startColResize(e, c) {
  e.preventDefault(); e.stopPropagation();
  const sh = sheet();
  const startX = e.clientX;
  const startW = sh.colWidths[c] || COL_W;
  const onMove = (e) => {
    const newW = Math.max(20, startW + e.clientX - startX);
    sh.colWidths[c] = newW;
    const ch = document.getElementById('ch-'+c);
    if (ch) { ch.style.minWidth = newW+'px'; }
    for (let r=1;r<=ROWS;r++) {
      const el = document.getElementById('c-'+r+'-'+c);
      if (el) { el.style.minWidth=newW+'px'; el.style.maxWidth=newW+'px'; el.style.width=newW+'px'; }
    }
  };
  const onUp = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}

// ─── FILL HANDLE ───
function startFillDrag(e) {
  e.preventDefault();
  const startR=sel.r, startC=sel.c;
  const srcVal = (getCell(startR,startC)||{}).raw||'';
  const srcNum = parseFloat(srcVal);
  const onMove = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.dataset.r) return;
    const tR = parseInt(el.dataset.r);
    const tC = parseInt(el.dataset.c);
    if (tR===startR) {
      // Horizontal fill
      const minC=Math.min(startC,tC), maxC=Math.max(startC,tC);
      sel.r2=startR; sel.c2=tC;
    } else {
      sel.r2=tR; sel.c2=startC;
    }
    renderGrid();
    updateSelBox();
  };
  const onUp = (e) => {
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    // Fill
    saveUndoState();
    const r1=Math.min(sel.r,sel.r2),r2=Math.max(sel.r,sel.r2);
    const c1=Math.min(sel.c,sel.c2),c2=Math.max(sel.c,sel.c2);
    for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
      if (r===startR&&c===startC) continue;
      const cd = JSON.parse(JSON.stringify(getCell(startR,startC)||{}));
      if (String(cd.raw||'').startsWith('=')) {
        cd.raw = adjustFormula(cd.raw, r-startR, c-startC);
        cd.calc = evalFormula(cd.raw, r, c);
      } else if (!isNaN(srcNum) && srcNum !== '') {
        // Auto-increment for sequences
        const step = r>startR ? r-startR : c-startC;
        cd.raw = String(srcNum + step);
      }
      setCell(r,c,cd);
    }
    renderGrid();
  };
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}

// ─── VIEW ───
function toggleGridlines() {
  showGridlines = !showGridlines;
  document.querySelectorAll('.cell').forEach(el => {
    el.style.border = showGridlines ? '' : 'none';
    el.style.borderRight = showGridlines ? '' : '1px solid transparent';
    el.style.borderBottom = showGridlines ? '' : '1px solid transparent';
  });
  document.getElementById('rb-grid')?.classList.toggle('pressed', showGridlines);
}
function toggleHeaders() {
  showHeaders = !showHeaders;
  document.getElementById('col-headers').style.display = showHeaders ? 'flex' : 'none';
  document.querySelectorAll('.row-num').forEach(el => el.style.display = showHeaders ? '' : 'none');
  document.getElementById('rb-heads')?.classList.toggle('pressed', showHeaders);
}
function toggleFormulaBar() {
  showFBar = !showFBar;
  document.getElementById('formula-bar').style.display = showFBar ? '' : 'none';
  document.getElementById('rb-fbar')?.classList.toggle('pressed', showFBar);
}
function setZoom(val) {
  zoom = parseInt(val);
  document.getElementById('grid-scroll').style.transform = `scale(${zoom/100})`;
  document.getElementById('grid-scroll').style.transformOrigin = 'top left';
  document.getElementById('zoom-disp').textContent = zoom + '%';
  document.getElementById('zoom-disp-bar').textContent = zoom + '%';
}
function freezeRow() {
  sheet().frozenRow = sel.r;
  alert('Lignes jusqu\'à la ligne ' + sel.r + ' figées (style visuel).');
}
function freezeCol() { sheet().frozenCol = sel.c; }
function unfreeze() { sheet().frozenRow = 0; sheet().frozenCol = 0; }
function toggleShowFormulas() {
  showFormulas = !showFormulas;
  renderGrid();
}
function onGridScroll() { updateSelBox(); }
function fullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
function newWindow() { window.open(location.href, '_blank'); }

// ─── FILE OPS ───
function newWorkbook() {
  if (wb.modified && !confirm('Modifications non enregistrées. Continuer ?')) return;
  currentFilePath = null;
  wb = { name:'Classeur1', sheets:[createSheet('Feuil1'),createSheet('Feuil2'),createSheet('Feuil3')], activeSheet:0, modified:false };
  initGrid();
  renderSheetTabs();
  document.getElementById('doc-name').textContent = ' — Classeur1';
}
function openFile() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.fsheet,.csv,.tsv,.txt,.json';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (file.name.endsWith('.json') || file.name.endsWith('.fsheet')) {
        try { const d=JSON.parse(ev.target.result); if(d.sheets){wb=d;initGrid();renderSheetTabs();} } catch(e){}
        return;
      }
      const delim = file.name.endsWith('.tsv') ? '\t' : ',';
      const lines = ev.target.result.split('\n').filter(l=>l.trim());
      saveUndoState();
      const sh = sheet();
      lines.forEach((line, ri) => {
        const cols = parseCsvLine(line, delim);
        cols.forEach((val, ci) => {
          if (ri+1>ROWS||ci+1>COLS) return;
          sh.cells[cellKey(ri+1,ci+1)] = {raw: val.trim()};
        });
      });
      wb.name = file.name.replace(/\.[^.]+$/,'');
        document.getElementById('doc-name').textContent = ' - ' + wb.name;
      renderGrid();
    };
    reader.readAsText(file, 'UTF-8');
  };
  input.click();
}

function loadWorkbookContent(content, fileName = 'Classeur1', path = null) {
  if (typeof content !== 'string') return;
  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.json') || lowerName.endsWith('.fsheet')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.sheets)) {
        wb = parsed;
        wb.modified = false;
        currentFilePath = path;
        initGrid();
        renderSheetTabs();
        document.getElementById('doc-name').textContent = ' — ' + wb.name;
      }
    } catch (err) {}
    return;
  }

  const delim = lowerName.endsWith('.tsv') || lowerName.endsWith('.txt') ? '\t' : ',';
  wb = { name: fileName.replace(/\.[^.]+$/,''), sheets:[createSheet('Feuil1')], activeSheet:0, modified:false };
  const lines = content.split('\n').filter(l => l.trim());
  const sh = wb.sheets[0];
  lines.forEach((line, ri) => {
    const cols = parseCsvLine(line, delim);
    cols.forEach((val, ci) => {
      if (ri + 1 > ROWS || ci + 1 > COLS) return;
      sh.cells[cellKey(ri + 1, ci + 1)] = { raw: val.trim() };
    });
  });
  currentFilePath = path;
  initGrid();
  renderSheetTabs();
  document.getElementById('doc-name').textContent = ' — ' + wb.name;
  renderGrid();
}
function parseCsvLine(line, delim=',') {
  const result=[]; let cur='', inQuote=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (ch==='"') { inQuote=!inQuote; continue; }
    if (ch===delim && !inQuote) { result.push(cur); cur=''; }
    else cur+=ch;
  }
  result.push(cur);
  return result;
}
async function saveWorkbook() {
  const data = JSON.stringify(wb);
  const blob = new Blob([data],{type:'application/json'});
  const targetPath = currentFilePath || `/Documents/${wb.name}.fsheet`;
  const saved = await saveBlobToPath(blob, targetPath, wb.name + '.fsheet');
  if (!saved) return false;
  wb.modified = false;
  document.getElementById('save-ind').textContent = '✓ Enregistré';
  setTimeout(()=>document.getElementById('save-ind').textContent='',2000);
  return true;
}

function saveWorkbookAs() {
  openExportModal('saveAs', 'fsheet');
}

async function saveBlobWithPrompt(blob, name) {
  const wm = window.parent && window.parent.windowManager;
  const defaultPath = currentFilePath || `/Documents/${name}`;
  const rawPath = prompt('Chemin de sauvegarde :', defaultPath);
  const targetPath = wm && typeof wm.normalizeVfsPath === 'function'
    ? wm.normalizeVfsPath(rawPath)
    : rawPath;
  if (!targetPath) return false;

  if (wm && typeof wm.vfs_write === 'function') {
    try {
      const content = await blob.text();
      wm.vfs_write(targetPath, content, 'file');
      currentFilePath = targetPath;
      wb.name = targetPath.split('/').pop().replace(/\.[^.]+$/, '');
      if (wm.notify) wm.notify('AetherSheets', `Fichier enregistre dans ${targetPath}`);
      return true;
    } catch (err) {}
  }

  // S'assurer que le blob a bien du contenu
  if (!blob || blob.size === 0) {
    console.error('Blob is empty or invalid');
    return false;
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  
  // Ajouter au DOM pour garantir le clic
  document.body.appendChild(a);
  a.click();
  
  // Nettoyer
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  return true;
}

async function saveBlobToPath(blob, targetPath, fallbackName) {
  const wm = window.parent && window.parent.windowManager;
  const normalizedPath = wm && typeof wm.normalizeVfsPath === 'function'
    ? wm.normalizeVfsPath(targetPath)
    : targetPath;
  if (!normalizedPath) return false;

  if (wm && typeof wm.vfs_write === 'function') {
    try {
      const content = await blob.text();
      wm.vfs_write(normalizedPath, content, 'file');
      currentFilePath = normalizedPath;
      wb.name = normalizedPath.split('/').pop().replace(/\.[^.]+$/, '');
      if (wm.notify) wm.notify('AetherSheets', `Fichier enregistre dans ${normalizedPath}`);
      return true;
    } catch (err) {
      return false;
    }
  }

  // S'assurer que le blob a bien du contenu
  if (!blob || blob.size === 0) {
    console.error('Blob is empty or invalid');
    return false;
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName || normalizedPath.split('/').pop();
  
  // Ajouter au DOM pour garantir le clic
  document.body.appendChild(a);
  a.click();
  
  // Nettoyer
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  return true;
}

function openExportModal(mode = 'export', forcedFormat = '') {
  exportMode = mode;
  document.getElementById('exp-name').value = wb.name;
  document.getElementById('exp-dir').value = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) || '/Documents' : '/Documents';
  document.getElementById('exp-fmt').value = forcedFormat || 'fsheet';
  document.getElementById('exp-fmt').disabled = !!forcedFormat;
  document.getElementById('export-modal-title').textContent = mode === 'saveAs' ? 'Enregistrer le classeur sous' : 'Exporter le classeur';
  document.getElementById('export-modal-submit').textContent = mode === 'saveAs' ? 'Enregistrer' : 'Exporter';
  document.getElementById('modal-export').classList.add('open');
}
async function doExport() {
  const fmt = document.getElementById('exp-fmt').value;
  const name = document.getElementById('exp-name').value || wb.name;
  const directory = (document.getElementById('exp-dir').value || '/Documents').trim() || '/Documents';
  const headers = document.getElementById('exp-headers').checked;
  let content, mime, ext = fmt;
  if (fmt==='fsheet') {
    content = JSON.stringify(wb, null, 2);
    mime = 'application/json';
  } else if (fmt==='csv' || fmt==='txt') {
    const delim = fmt==='txt' ? '\t' : ',';
    const sh = sheet();
    const rows = [];
    if (headers) {
      const h=[];for(let c=1;c<=COLS;c++) h.push(colLetter(c)); rows.push(h.join(delim));
    }
    for (let r=1;r<=ROWS;r++) {
      const row = [];
      let hasData=false;
      for (let c=1;c<=COLS;c++) {
        const v = getCellValue(r,c,sh);
        if (v!=='') hasData=true;
        row.push(fmt==='csv' ? (String(v).includes(',')?'"'+v+'"':v) : v);
      }
      if (hasData) rows.push(row.join(delim));
    }
    content = rows.join('\n');
    mime = 'text/' + (fmt==='csv'?'csv':'plain');
  } else if (fmt==='html') {
    const sh = sheet();
    let tbl = '<table border="1" style="border-collapse:collapse;font-family:IBM Plex Sans,sans-serif;font-size:12px;">';
    for (let r=1;r<=ROWS;r++) {
      let hasData=false;
      for (let c=1;c<=COLS;c++) if(getCellValue(r,c,sh)!=='') {hasData=true;break;}
      if (!hasData) continue;
      tbl += '<tr>';
      for (let c=1;c<=COLS;c++) {
        const cd=getCell(r,c,sh); const v=getCellValue(r,c,sh);
        const style=cd&&cd.fmt?`style="font-weight:${cd.fmt.bold?'bold':'normal'};background:${cd.fmt.bg||'white'};color:${cd.fmt.color||'black'}"`:'';
        tbl+=`<td ${style}>${v}</td>`;
      }
      tbl+='</tr>';
    }
    tbl+='</table>';
    content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name}</title></head><body>${tbl}</body></html>`;
    mime = 'text/html';
  } else if (fmt==='json') {
    content = JSON.stringify(wb, null, 2);
    mime = 'application/json';
  }
  const blob = new Blob([content],{type:mime});
  const targetPath = `${directory.replace(/\/+$/, '')}/${name}.${ext}`;
  const saved = await saveBlobToPath(blob, targetPath, `${name}.${ext}`);
  if (!saved) return;
  if (fmt === 'fsheet') {
    wb.modified = false;
    wb.name = name;
    document.getElementById('save-ind').textContent = '✓ Enregistré';
    setTimeout(()=>document.getElementById('save-ind').textContent='',2000);
  }
  exportMode = 'export';
  document.getElementById('exp-fmt').disabled = false;
  closeModal('modal-export');
}
function pickExportDirectory() {
  const wm = window.parent && window.parent.windowManager;
  if (!wm || typeof wm.openPathPicker !== 'function') return;
  exportPickerRequestId = wm.openPathPicker('excel', {
    mode: 'folder',
    startPath: document.getElementById('exp-dir').value || '/Documents'
  });
}
function importCSV() { openFile(); }
function exportCSV() { openExportModal(); document.getElementById('exp-fmt').value='csv'; }
function printSheet() {
  const w = window.open('','_blank');
  const sh = sheet();
  let tbl = '<table border="1" style="border-collapse:collapse;font-size:11px;">';
  for (let r=1;r<=ROWS;r++) {
    let hasData=false; for(let c=1;c<=COLS;c++) if(getCellValue(r,c,sh)!==''){hasData=true;break;}
    if(!hasData) continue;
    tbl+='<tr>'; for(let c=1;c<=COLS;c++) tbl+=`<td style="padding:4px 6px">${getCellValue(r,c,sh)||''}</td>`; tbl+='</tr>';
  }
  tbl+='</table>';
  w.document.write(`<html><head><title>${wb.name}</title></head><body>${tbl}</body></html>`);
  w.document.close(); w.print();
}

// ─── CONTEXT MENU ───
function cellRightClick(e, r, c) {
  e.preventDefault();
  sel = {r,c,r2:r,c2:c};
  updateUIFromSel();
  const m = document.getElementById('ctx');
  m.style.left = Math.min(e.clientX, window.innerWidth-220) + 'px';
  m.style.top = Math.min(e.clientY, window.innerHeight-380) + 'px';
  m.classList.add('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ctx')) document.getElementById('ctx').classList.remove('open');
  if (!e.target.closest('.dd')) closeAllDropdowns();
});
function closeCtx() { document.getElementById('ctx').classList.remove('open'); }

// ─── FIND / REPLACE ───
function openFindPanel() {
  document.getElementById('find-panel').classList.add('open');
  document.getElementById('fp-replace-row').style.display = 'none';
  document.getElementById('fp-rep-btn').textContent = 'Remplacer ▾';
  document.getElementById('fp-find').focus();
}
function openFindReplacePanel() {
  openFindPanel();
  document.getElementById('fp-replace-row').style.display = 'flex';
  document.getElementById('fp-rep-btn').textContent = 'Remplacer ▴';
}
function closeFindPanel() { document.getElementById('find-panel').classList.remove('open'); clearSearchHL(); }
function toggleFpReplace() {
  const row = document.getElementById('fp-replace-row');
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : 'flex';
  document.getElementById('fp-rep-btn').textContent = open ? 'Remplacer ▾' : 'Remplacer ▴';
}
function liveSearch() {
  clearSearchHL();
  const q = document.getElementById('fp-find').value;
  if (!q) { document.getElementById('fp-count').textContent=''; return; }
  const sh = sheet();
  searchMatches = [];
  const matchCase = document.getElementById('fp-case').checked;
  const exact = document.getElementById('fp-exact').checked;
  for (let r=1;r<=ROWS;r++) for (let c=1;c<=COLS;c++) {
    const v = String(getCellValue(r,c,sh)||'');
    const vt = matchCase?v:v.toLowerCase(), qt=matchCase?q:q.toLowerCase();
    if ((exact&&vt===qt)||(!exact&&vt.includes(qt))) {
      searchMatches.push({r,c});
      const el=document.getElementById('c-'+r+'-'+c);
      if (el) el.style.outline='2px solid orange';
    }
  }
  document.getElementById('fp-count').textContent = searchMatches.length ? searchMatches.length+' résultat(s)' : 'Aucun';
  if (searchMatches.length) { searchIdx=0; highlightSearchCurrent(); }
}
function clearSearchHL() {
  searchMatches.forEach(({r,c})=>{ const el=document.getElementById('c-'+r+'-'+c); if(el) el.style.outline=''; });
}
function highlightSearchCurrent() {
  if (!searchMatches.length) return;
  const {r,c} = searchMatches[searchIdx];
  sel = {r,c,r2:r,c2:c};
  updateUIFromSel();
  scrollToCell(r,c);
}
function findNext() { if(!searchMatches.length)liveSearch(); else { searchIdx=(searchIdx+1)%searchMatches.length; highlightSearchCurrent(); } }
function findPrev() { if(!searchMatches.length)return; searchIdx=(searchIdx-1+searchMatches.length)%searchMatches.length; highlightSearchCurrent(); }
function replaceOne() {
  if (!searchMatches.length) { liveSearch(); return; }
  const {r,c} = searchMatches[searchIdx];
  const q=document.getElementById('fp-find').value, rv=document.getElementById('fp-replace').value;
  saveUndoState();
  const cd=getCell(r,c)||{}; cd.raw=String(cd.raw||'').replace(q,rv); setCell(r,c,cd);
  renderGrid(); liveSearch();
}
function replaceAll() {
  const q=document.getElementById('fp-find').value, rv=document.getElementById('fp-replace').value;
  saveUndoState();
  const sh=sheet(); let count=0;
  Object.keys(sh.cells).forEach(k=>{
    const cd=sh.cells[k];
    if (cd&&String(cd.raw||'').includes(q)) { cd.raw=String(cd.raw).split(q).join(rv); count++; }
  });
  renderGrid(); document.getElementById('fp-count').textContent=count+' remplacement(s)';
}

// ─── FORMAT CELL MODAL ───
function openFmtCellModal() {
  fmtTab('number');
  document.getElementById('modal-fmtcell').classList.add('open');
}
function fmtTab(tab) {
  ['number','alignment','font','border','fill'].forEach(t=>{
    document.getElementById('fmt-panel-'+t).style.display = t===tab?'':'none';
    const btn = document.getElementById('ftab-'+t);
    if (btn) btn.className = t===tab?'btn btn-primary btn-sm':'btn btn-sm';
  });
}
function updateFmtPreview() {
  const val = parseFloat(getCellValue(sel.r,sel.c)) || 123456.789;
  const cat = document.getElementById('fmt-cat').value;
  const dec = parseInt(document.getElementById('fmt-dec').value)||2;
  const sep = document.getElementById('fmt-sep').value === 'yes';
  const preview = document.getElementById('fmt-preview');
  if (cat==='number') preview.textContent = sep ? val.toLocaleString('fr-FR',{minimumFractionDigits:dec,maximumFractionDigits:dec}) : val.toFixed(dec);
  else if (cat==='currency') preview.textContent = val.toLocaleString('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:dec,maximumFractionDigits:dec});
  else if (cat==='percent') preview.textContent = (val/100).toFixed(dec)+'%';
  else if (cat==='scientific') preview.textContent = val.toExponential(2);
  else if (cat==='date') preview.textContent = serialToDate(val).toLocaleDateString('fr-FR');
  else preview.textContent = String(val);
}
function applyFmtCellModal() {
  saveUndoState();
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2),c2=Math.max(sel.c,sel.c2);
  for (let r=r1;r<=r2;r++) for (let c=c1;c<=c2;c++) {
    const cd=getCell(r,c)||{raw:''}; if(!cd.fmt)cd.fmt={};
    cd.fmt.numFmt = document.getElementById('fmt-cat').value;
    cd.fmt.dec = parseInt(document.getElementById('fmt-dec').value)||2;
    cd.fmt.sep = document.getElementById('fmt-sep').value==='yes';
    cd.fmt.align = document.getElementById('fmt-halign').value||undefined;
    cd.fmt.valign = document.getElementById('fmt-valign').value||undefined;
    cd.fmt.wrap = document.getElementById('fmt-wrap').checked;
    if (document.getElementById('fmt-merge').checked) {}
    cd.fmt.font = document.getElementById('fmt-ff').value;
    cd.fmt.fontSize = parseInt(document.getElementById('fmt-fs').value)||11;
    cd.fmt.bold = document.getElementById('fmt-bold').checked;
    cd.fmt.italic = document.getElementById('fmt-ital').checked;
    cd.fmt.underline = document.getElementById('fmt-ul').checked;
    cd.fmt.color = document.getElementById('fmt-fc').value;
    cd.fmt.bg = document.getElementById('fmt-bg').value;
    const bs=document.getElementById('fmt-border-style').value, bc=document.getElementById('fmt-border-color').value;
    if (document.getElementById('fb-top').checked) { if(!cd.fmt.border)cd.fmt.border={}; cd.fmt.border.top=bs+' '+bc; }
    if (document.getElementById('fb-bot').checked) { if(!cd.fmt.border)cd.fmt.border={}; cd.fmt.border.bottom=bs+' '+bc; }
    if (document.getElementById('fb-left').checked) { if(!cd.fmt.border)cd.fmt.border={}; cd.fmt.border.left=bs+' '+bc; }
    if (document.getElementById('fb-right').checked) { if(!cd.fmt.border)cd.fmt.border={}; cd.fmt.border.right=bs+' '+bc; }
    setCell(r,c,cd);
  }
  closeModal('modal-fmtcell');
  renderGrid();
}

// ─── FUNCTION MODAL ───
function openFnModal() {
  filterFns();
  document.getElementById('modal-fn').classList.add('open');
}
function filterFns() {
  const cat = document.getElementById('fn-cat').value;
  const list = document.getElementById('fn-list');
  list.innerHTML = '';
  Object.entries(FN_INFO).filter(([,v])=>cat==='all'||v.cat===cat).forEach(([name,info])=>{
    const it = document.createElement('div');
    it.style.cssText='padding:5px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);';
    it.onmouseenter=()=>it.style.background='var(--gray-100)';
    it.onmouseleave=()=>it.style.background='';
    it.innerHTML = `<strong>${name}</strong> <span style="color:var(--gray-500);font-size:11px">${info.syntax}</span>`;
    it.onclick=()=>{ fnSelected=name; document.getElementById('fn-desc').innerHTML=`<strong>${name}</strong><br><code>${info.syntax}</code><br><span style="color:var(--gray-500)">${info.desc}</span>`; list.querySelectorAll('div').forEach(d=>d.style.background=''); it.style.background='var(--green-light)'; };
    list.appendChild(it);
  });
}
function confirmFnInsert() {
  if (fnSelected) {
    const info = FN_INFO[fnSelected];
    startEdit(sel.r, sel.c, '=' + fnSelected + '(');
  }
  closeModal('modal-fn');
}

// ─── FN HINT ───
function showFnHint(name) {
  const info = FN_INFO[name];
  const hint = document.getElementById('fn-hint');
  if (!info) { hint.style.display='none'; return; }
  hint.innerHTML = `<b>${name}</b> – ${info.syntax}<br><span style="color:#ccc">${info.desc}</span>`;
  hint.style.display = 'block';
  const el = document.getElementById('c-'+sel.r+'-'+sel.c);
  if (el) {
    const r = el.getBoundingClientRect();
    hint.style.left = r.left + 'px';
    hint.style.top = (r.bottom + 4) + 'px';
  }
}
function hideFnHint() { document.getElementById('fn-hint').style.display='none'; }

// ─── REVIEW ───
function protectSheet() {
  const pw = prompt('Mot de passe (laisser vide pour annuler):');
  if (pw !== null) { sheet()._protected=pw; alert('Feuille protégée.'); }
}
function unprotectSheet() {
  const pw = prompt('Mot de passe:');
  if (pw === sheet()._protected) { delete sheet()._protected; alert('Feuille déprotégée.'); }
  else alert('Mot de passe incorrect.');
}
function protectWorkbook() {
  const pw = prompt('Mot de passe classeur:');
  if (pw) wb._protected = pw;
}
function trackChanges() { alert('Suivi des modifications activé (mode visuel).'); }
function addComment() { insertComment(); }
function insertComment() {
  const c = prompt('Commentaire pour ' + cellRef(sel.r,sel.c) + ':','');
  if (c !== null) { sheet().comments[cellKey(sel.r,sel.c)] = c; renderGrid(); }
}
function showComments() {
  const comments = sheet().comments;
  const entries = Object.entries(comments);
  if (!entries.length) { alert('Aucun commentaire.'); return; }
  alert(entries.map(([k,v])=>{const[r,c]=k.split(',');return cellRef(+r,+c)+': '+v;}).join('\n'));
}

// ─── MISC ───
function insertHyperlink() {
  const url = prompt('URL:', 'https://');
  const text = prompt('Texte:', url);
  if (url && text) {
    saveUndoState();
    const cd = getCell(sel.r,sel.c)||{};
    cd.raw = text;
    if (!cd.fmt) cd.fmt={};
    cd.fmt.color='#1e7e45'; cd.fmt.underline=true;
    cd.link = url;
    setCell(sel.r,sel.c,cd);
    renderGrid();
  }
}
function insertDropdown() { openDataValidationModal(); document.getElementById('dv-type').value='list'; }
function insertDate() {
  saveUndoState();
  const cd=getCell(sel.r,sel.c)||{}; cd.raw=String(dateToSerial(new Date())); if(!cd.fmt)cd.fmt={}; cd.fmt.numFmt='date';
  setCell(sel.r,sel.c,cd); renderGrid();
}
function textToColumns() {
  const delim = prompt('Délimiteur (ex: , ; | espace):', ',');
  if (!delim) return;
  saveUndoState();
  for (let r=Math.min(sel.r,sel.r2);r<=Math.max(sel.r,sel.r2);r++) {
    const v = String(getCellValue(r,sel.c)||'');
    const parts = v.split(delim);
    parts.forEach((p,i) => {
      const cd={raw:p.trim()};
      setCell(r,sel.c+i,cd);
    });
    if (parts.length>1) setCell(r,sel.c,{raw:parts[0].trim()});
  }
  renderGrid();
}
function subtotal() {
  const r1=Math.min(sel.r,sel.r2),c1=Math.min(sel.c,sel.c2);
  const r2=Math.max(sel.r,sel.r2);
  saveUndoState();
  for (let c=c1;c<=Math.max(sel.c,sel.c2);c++) {
    const cd={raw:`=SUM(${cellRef(r1,c)}:${cellRef(r2,c)})`};
    cd.calc = evalFormula(cd.raw,r2+1,c);
    setCell(r2+1,c,cd);
    const fmtCd={raw:'TOTAL',fmt:{bold:true}};
    if (c===c1) setCell(r2+1,c,{raw:'TOTAL',fmt:{bold:true}});
    else { const dcd={raw:`=SUM(${cellRef(r1,c)}:${cellRef(r2,c)})`,fmt:{bold:true}}; dcd.calc=evalFormula(dcd.raw,r2+1,c); setCell(r2+1,c,dcd); }
  }
  renderGrid();
}
function groupRows() {
  const r1=Math.min(sel.r,sel.r2),r2=Math.max(sel.r,sel.r2);
  const toggle = document.createElement('div');
  toggle.style.cssText=`position:absolute;left:0;cursor:pointer;background:var(--green);color:white;font-size:10px;padding:0 4px;border-radius:0 3px 3px 0;z-index:20;`;
  toggle.textContent='-'; let collapsed=false;
  const row1El=document.getElementById('row-'+r1); if(row1El){toggle.style.top=row1El.offsetTop+'px'; row1El.parentElement.prepend(toggle);}
  toggle.onclick=()=>{ collapsed=!collapsed; toggle.textContent=collapsed?'+':'-'; for(let r=r1+1;r<=r2;r++){const el=document.getElementById('row-'+r);if(el)el.style.display=collapsed?'none':'';} };
}
function ungroupRows() { document.querySelectorAll('[style*="cursor: pointer"][style*="var(--green)"]').forEach(el=>el.remove()); clearFilters(); }
function traceError() {
  const cd=getCell(sel.r,sel.c);
  if (!cd||!String(cd.raw).startsWith('=')) { alert('Sélectionnez une cellule avec une formule.'); return; }
  const refs = (cd.raw||'').match(/[A-Z]{1,2}\d+/g)||[];
  refs.forEach(ref=>{
    const p=parseRef(ref);
    if(!p)return;
    const el=document.getElementById('c-'+p.r+'-'+p.c);
    if(el){el.style.outline='2px solid #FF9800'; setTimeout(()=>{el.style.outline='';},3000);}
  });
}

// ─── PROTECTION ───
function checkProtected() {
  if (sheet()._protected) { alert('Feuille protégée. Entrez le mot de passe pour modifier.'); return true; }
  return false;
}

// ─── COLOR GRIDS ───
const COLORS = ['#000000','#434343','#666666','#999999','#b7b7b7','#cccccc','#d9d9d9','#efefef','#f3f3f3','#ffffff','#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff','#e06666','#f6b26b','#ffd966','#93c47d','#76a5af','#6fa8dc','#6c5ce7','#c27ba0','#cc4125','#e69138','#f1c232','#6aa84f','#45818e','#3d85c6','#674ea7','#a64d79','#1e7e45','#0d5c36','#1565c0','#4a148c','#880e4f'];
function initColorGrids() {
  ['fc-grid','bc-grid','fill-preset-grid'].forEach((gid,idx) => {
    const grid = document.getElementById(gid);
    if (!grid) return;
    COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'cs'; sw.style.background = c; sw.title = c;
      sw.onclick = () => {
        if (idx===0) { applyFmt('color',c); closeAllDropdowns(); }
        else if (idx===1) { applyFmt('bg',c); closeAllDropdowns(); }
        else { document.getElementById('fmt-bg').value = c; }
      };
      grid.appendChild(sw);
    });
  });
}

// ─── DROPDOWNS ───
function toggleDD(id) {
  const dd=document.getElementById(id);
  const was=dd.classList.contains('open');
  closeAllDropdowns();
  if (!was) dd.classList.add('open');
}
function closeAllDropdowns() { document.querySelectorAll('.dd-menu').forEach(d=>d.classList.remove('open')); }

// ─── MODALS ───
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');}));
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){closeAllDropdowns();document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));}});

// ─── TABS ───
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',function(){
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.ribbon-panel').forEach(p=>p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('panel-'+this.dataset.tab).classList.add('active');
  });
});

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  initGrid();
  renderSheetTabs();
  initColorGrids();
  
  // Load autosave
  try {
    const saved = localStorage.getItem('aethersheets_as');
    if (saved && confirm('Restaurer la sauvegarde automatique ?')) {
      wb = JSON.parse(saved);
      initGrid();
      renderSheetTabs();
  document.getElementById('doc-name').textContent = ' - ' + wb.name;
    }
  } catch(e){}

  // Auto-save every 60s
  setInterval(()=>{
    if (wb.modified) {
      try { localStorage.setItem('aethersheets_as', JSON.stringify(wb)); } catch(e){}
      document.getElementById('save-ind').textContent = '↺ Auto';
      setTimeout(()=>document.getElementById('save-ind').textContent='',1500);
    }
  }, 60000);
});

window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'open_file' && data.path) {
    loadWorkbookContent(typeof data.content === 'string' ? data.content : '', data.name || data.path.split('/').pop(), data.path);
  } else if (data.type === 'OS_PATH_PICKED' && data.requestId === exportPickerRequestId) {
    document.getElementById('exp-dir').value = data.path || '/Documents';
    exportPickerRequestId = null;
  }
});

window.addEventListener('beforeunload', e=>{ if(wb.modified){e.preventDefault();e.returnValue='';} });
