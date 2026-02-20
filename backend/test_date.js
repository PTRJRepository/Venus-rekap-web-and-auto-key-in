
const t1 = "18:46";
const base = "2026-01-06";
const combined = `${base}T${t1}`;
const d = new Date(combined);
console.log(`'${combined}' ->`, d.toString(), 'Ts:', d.getTime());

const t2 = "06:01:09";
const combined2 = `${base}T${t2}`;
const d2 = new Date(combined2);
console.log(`'${combined2}' ->`, d2.toString(), 'Ts:', d2.getTime());
