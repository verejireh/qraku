const fs = require('fs');
const path = require('path');
const targetDir = 'z:/orderservice/frontend-react/src/views';
const files = fs.readdirSync(targetDir)
  .filter(f => f.startsWith('Admin') || f === 'MenuManagementView.jsx')
  .map(f => path.join(targetDir, f));

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Replace colors
  content = content
    .replace(/bg-indigo-600/g, 'bg-adminprimary')
    .replace(/text-indigo-600/g, 'text-adminprimary')
    .replace(/border-indigo-600/g, 'border-adminprimary')
    .replace(/ring-indigo-600/g, 'ring-adminprimary')

    .replace(/bg-indigo-500/g, 'bg-adminprimary')
    .replace(/text-indigo-500/g, 'text-adminprimary')
    .replace(/border-indigo-500/g, 'border-adminprimary')
    .replace(/ring-indigo-500/g, 'ring-adminprimary')

    .replace(/bg-indigo-400/g, 'bg-adminprimary\/50')
    .replace(/text-indigo-400/g, 'text-adminprimary\/50')
    .replace(/border-indigo-400/g, 'border-adminprimary\/50')

    .replace(/bg-indigo-300/g, 'bg-adminprimary\/40')
    .replace(/text-indigo-300/g, 'text-adminprimary\/40')
    
    .replace(/bg-indigo-200/g, 'bg-adminprimary\/30')
    .replace(/border-indigo-200/g, 'border-adminprimary\/30')

    .replace(/bg-indigo-100/g, 'bg-adminprimary\/20')
    .replace(/text-indigo-100/g, 'text-adminprimary\/20')
    .replace(/border-indigo-100/g, 'border-adminprimary\/20')

    .replace(/bg-indigo-50\/40/g, 'bg-adminprimary\/5')
    .replace(/bg-indigo-50\/30/g, 'bg-adminprimary\/5')
    .replace(/bg-indigo-50/g, 'bg-adminprimary\/10')
    .replace(/text-indigo-50/g, 'text-adminprimary\/10')
    .replace(/border-indigo-50/g, 'border-adminprimary\/10')
    .replace(/text-amber-500/g, 'text-adminprimary');

  // Replace layout backgrounds globally
  content = content.replace(
    /min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50\/30/g,
    'min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg'
  );
  content = content.replace(
    /min-h-screen bg-slate-50 flex/g,
    'min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg flex'
  );

  fs.writeFileSync(f, content, 'utf8');
});
console.log('Colors replaced successfully for ' + files.length + ' files.');
