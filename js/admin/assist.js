/* Description helpers: a writing guide, a quality meter, and "suggest key features and specifications from the description".
   Works fully in the browser, no AI account needed. */
(function(){
'use strict';
var A=window.A;
var SPEC_RULES=[
 ['Processor',/\b((?:Snapdragon|Dimensity|Helio|Exynos|Kirin|Tensor|Apple\s*A\d+\w*|Apple\s*M\d\w*|Intel\s*Core\s*(?:Ultra\s*)?i?\d[\w-]*|Core\s*i\d[\w-]*|Ryzen\s*\d[\w-]*|Celeron\s*\w+|Pentium\s*\w+)[^,.;\n]{0,22})/i,1],
 ['RAM',/(\d+)\s*(GB|MB)\s*(?:of\s*)?(?:RAM|memory)\b/i,function(m){return m[1]+m[2].toUpperCase()}],
 ['Storage',/(\d+)\s*(GB|TB)\s*(?:of\s*)?(?:internal\s*)?(?:storage|ROM|SSD|HDD|eMMC|flash)/i,function(m){return m[1]+m[2].toUpperCase()}],
 ['Display size',/(\d{1,2}(?:\.\d{1,2})?)\s*(?:-?\s*inch(?:es)?|"|”)(?!\s*(?:wheel|tyre))/i,function(m){return m[1]+' inches'}],
 ['Refresh rate',/(\d{2,3})\s*Hz/i,function(m){return m[1]+'Hz'}],
 ['Display type',/\b(AMOLED|Super AMOLED|OLED|IPS(?:\s*LCD)?|LCD|Retina|Mini[- ]?LED|QLED)\b/i,1],
 ['Resolution',/\b(4K|8K|QHD\+?|FHD\+?|Full\s*HD|HD\+?|\d{3,4}\s*[x×]\s*\d{3,4})\b/i,1],
 ['Main camera',/(\d{2,3})\s*MP\s*(?:main|rear|primary|camera)?/i,function(m){return m[1]+'MP'}],
 ['Battery',/(\d{3,5})\s*mAh/i,function(m){return m[1]+'mAh'}],
 ['Battery life',/(?:up to\s*)?(\d{1,3})\s*(?:hours?|hrs?)\s*(?:of\s*)?(?:battery|playtime|playback|talk|use)/i,function(m){return'Up to '+m[1]+' hours'}],
 ['Charging',/(\d{2,3})\s*W\s*(?:fast\s*|super\s*|rapid\s*)?(?:charg|wired|turbo|flash)/i,function(m){return m[1]+'W fast charging'}],
 ['Connectivity',/\b(5G|4G\s*LTE|4G|Wi-?Fi\s*\d[E]?|Bluetooth\s*\d(?:\.\d)?)\b/i,1],
 ['Operating system',/\b(Android\s*\d{1,2}|iOS\s*\d{1,2}|iPadOS\s*\d{1,2}|Windows\s*(?:10|11)(?:\s*(?:Home|Pro))?|macOS|ChromeOS|HarmonyOS|One\s*UI\s*[\d.]+|MIUI\s*\d+)\b/i,1],
 ['Water resistance',/\b(IP\s?[5-8]\d[A-Z]?)\b/i,function(m){return m[1].replace(/\s/g,'').toUpperCase()}],
 ['Ports',/\b(USB[- ]?C|Type[- ]?C|Lightning|HDMI\s*\d?(?:\.\d)?|USB\s*3\.\d|Thunderbolt\s*\d?)\b/i,1],
 ['Weight',/\b(\d+(?:\.\d+)?)\s*(kg|g|grams?|kilograms?)\b/i,function(m){return m[1]+(/^k/i.test(m[2])?'kg':'g')}],
 ['Warranty',/(\d+|one|two|three)[\s-]*(month|year)s?\s*(?:limited\s*)?warranty/i,function(m){var n={one:1,two:2,three:3}[String(m[1]).toLowerCase()]||m[1];return n+' '+m[2].toLowerCase()+(Number(n)>1?'s':'')}],
 ['Colours',/colou?rs?\s*(?:available)?\s*[:\-]\s*([^.\n]{3,80})/i,1],
 ['Network',/\b(Dual\s*SIM|eSIM|Nano\s*SIM)\b/i,1],
 ['Extras',/\b(NFC|fingerprint(?:\s*sensor)?|face\s*unlock|noise\s*cancell?ing|ANC|wireless\s*charging)\b/i,function(m){return m[1]}]
];
var CLEAN=function(s){return String(s||'').replace(/\s+/g,' ').trim()};
A.assist={
 /* Reads the description (and current lists) and returns {features:[], specs:{}} that are NOT already filled in. */
 suggest:function(p){
  var text=String(p.description||'')+'\n'+String(p.shortDescription||'');
  var haveF=(p.features||[]).map(function(x){return x.toLowerCase()}),haveS=p.specifications||{},haveSK=Object.keys(haveS).map(function(k){return k.toLowerCase()});
  var specs={},feats=[];
  text.split(/\n/).forEach(function(line){var m=/^\s*[-•*✓✔▪►]?\s*([A-Za-z][A-Za-z0-9 /().&+-]{1,38}?)\s*[:\-–—]\s+(\S.{0,120})$/.exec(line);
    if(m&&!/^(note|tip|warning|includes?|package|in the box|what's in)/i.test(m[1])&&m[2].length<=80&&!/[.!?]\s+[A-Z]/.test(m[2])){specs[CLEAN(m[1]).replace(/^colors?$/i,'Colours')]=CLEAN(m[2]).replace(/[.;]$/,'')}});
  SPEC_RULES.forEach(function(r){var key=r[0];if(Object.keys(specs).some(function(k){return k.toLowerCase()===key.toLowerCase()}))return;var m=r[1].exec(text);if(!m)return;var val=typeof r[2]==='function'?r[2](m):m[r[2]];val=CLEAN(val);if(val)specs[key]=val});
  Object.keys(specs).forEach(function(k){if(haveSK.indexOf(k.toLowerCase())>-1)delete specs[k]});
  text.split(/\n/).forEach(function(line){var m=/^\s*[-•*✓✔▪►]\s*(.{6,150})$/.exec(line);if(m&&!/[:]\s+\S/.test(m[1]))feats.push(CLEAN(m[1]).replace(/[.;]$/,''))});
  if(feats.length<3){var BEN=/\b(long[- ]lasting|fast|lightweight|portable|durable|waterproof|water[- ]resistant|wireless|rechargeable|smooth|crisp|powerful|secure|comfortable|compact|premium|immersive|all[- ]day|noise|clear|bright|sharp|easy to|supports?|compatible|includes?|built[- ]in|designed)\b/i;
    text.replace(/\n+/g,'. ').split(/(?<=[.!?])\s+/).forEach(function(s){s=CLEAN(s).replace(/^[-•*✓✔▪►]\s*/,'').replace(/[.!?]$/,'');if(s.length>=18&&s.length<=90&&BEN.test(s)&&!/^[A-Z][^:]{0,30}:\s/.test(s))feats.push(s)})}
  var seen={};feats=feats.filter(function(f){var k=f.toLowerCase();if(seen[k]||haveF.indexOf(k)>-1)return false;seen[k]=1;return true}).slice(0,8);
  return{features:feats,specs:specs}},
 /* A starting layout the admin fills in. */
 template:function(p){var n=p.name||'this product',b=p.brand?p.brand+' ':'';
  return b+n+' is a [one line: what it is and who it is for].\n\n[Main benefit, in plain words. Example: all-day battery so you are not hunting for a charger.]\n\n[Second benefit: performance, comfort, quality or design.]\n\nIn the box: [list what the customer receives].\nWarranty: [e.g. 12 months].\n\nKey details:\n- [Short point 1]\n- [Short point 2]\n- [Short point 3]'},
 /* Quality checklist → {score, tips:[{ok,text}]} */
 score:function(p){var d=String(p.description||'').trim(),paras=d?d.split(/\n\s*\n/).filter(Boolean).length:0,t=[];
  var add=function(ok,x){t.push({ok:!!ok,text:x})};
  add(d.length>=250,'Description is at least 250 characters ('+d.length+' now)');
  add(paras>=2,'Split into 2 or more short paragraphs');
  add(/\b(box|includes?|comes with|package)\b/i.test(d),'Say what is in the box');
  add(/\b(warranty|guarantee)\b/i.test(d),'Mention the warranty');
  add(String(p.shortDescription||'').trim().length>=40,'Add a one-line summary for the product card');
  add((p.features||[]).length>=4,'List at least 4 key features ('+(p.features||[]).length+' now)');
  add(Object.keys(p.specifications||{}).length>=4,'List at least 4 specifications ('+Object.keys(p.specifications||{}).length+' now)');
  add(!/[A-Z]{6,}/.test(d)&&!/!{2,}/.test(d),'Avoid ALL CAPS and many exclamation marks');
  var ok=t.filter(function(x){return x.ok}).length;return{score:Math.round(ok/t.length*100),tips:t}}
};
})();
