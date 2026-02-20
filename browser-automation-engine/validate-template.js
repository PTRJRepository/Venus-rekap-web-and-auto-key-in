const fs = require('fs');
const t = JSON.parse(fs.readFileSync('templates/_attendance_logic_v3.json', 'utf8'));
console.log('Valid JSON:', !!t);
console.log('Name:', t.name);
console.log('Steps:', t.steps.length);
