const fs = require('fs');
const path = require('path');

// 1. Patch CommonJS index.js
const cjsPath = path.join(__dirname, '..', 'node_modules', '@tailwindcss', 'node', 'dist', 'index.js');
if (fs.existsSync(cjsPath)) {
  let content = fs.readFileSync(cjsPath, 'utf8');
  const target = 'function Le(e,r,t){return new Promise((n,i)=>e.resolve({},t,r,{},(l,o)=>{if(l)return i(l);n(o)}))}';
  const replacement = 'function Le(e,r,t){return new Promise((n,i)=>e.resolve({},t,r,{},(l,o)=>{if(l)return i(l);n(typeof o==="string"?o.replace(/\\0/g,""):o)}))}';

  if (content.includes(target)) {
    fs.writeFileSync(cjsPath, content.replace(target, replacement));
    console.log('[patch-tailwind] Successfully patched Le in index.js');
  } else {
    console.log('[patch-tailwind] index.js already patched or target changed');
  }
}

// 2. Patch ESM index.mjs
const esmPath = path.join(__dirname, '..', 'node_modules', '@tailwindcss', 'node', 'dist', 'index.mjs');
if (fs.existsSync(esmPath)) {
  let content = fs.readFileSync(esmPath, 'utf8');
  const target = 'function Oe(e,r,t){return new Promise((n,i)=>e.resolve({},t,r,{},(l,o)=>{if(l)return i(l);n(o)}))}';
  const replacement = 'function Oe(e,r,t){return new Promise((n,i)=>e.resolve({},t,r,{},(l,o)=>{if(l)return i(l);n(typeof o==="string"?o.replace(/\\0/g,""):o)}))}';

  if (content.includes(target)) {
    fs.writeFileSync(esmPath, content.replace(target, replacement));
    console.log('[patch-tailwind] Successfully patched Oe in index.mjs');
  } else {
    console.log('[patch-tailwind] index.mjs already patched or target changed');
  }
}
