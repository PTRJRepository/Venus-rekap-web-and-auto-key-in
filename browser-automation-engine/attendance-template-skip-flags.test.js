const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'templates', '_attendance_logic_v4.json');
const raw = fs.readFileSync(templatePath, 'utf8');

assert.match(raw, /attendance\.skipRegular\s*===\s*true/);
assert.match(raw, /attendance\.skipOvertime\s*===\s*true/);
