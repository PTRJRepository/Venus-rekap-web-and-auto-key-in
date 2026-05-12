const assert = require("node:assert/strict");
const {
  findRuleForComponent,
  findTaskCode,
  collectPayrollComponentGroups,
  buildPayrollAutomationComponents,
  getAutocompleteKeyword,
} = require("./payrollComponentMapping");

const taskCodes = [
  { taskCode: "GA9128", taskDesc: "TUNJANGAN JABATAN" },
  { taskCode: "GA9129", taskDesc: "TUNJANGAN MASA KERJA" },
  { taskCode: "DEPH21", taskDesc: "(DE) POTONGAN PPH21" },
  { taskCode: "DE0003", taskDesc: "POTONGAN SPSI" },
];

assert.equal(
  findRuleForComponent({ code: "#TJ_MASAKERJA#", name: "Tunjangan Masa Kerja" })
    .key,
  "masaKerja",
);
assert.equal(
  findRuleForComponent({ code: "#TJ_JABATAN#", name: "Tunjangan Jabatan" }).key,
  "jabatan",
);
assert.equal(
  findRuleForComponent({ code: "#PPH21_DIPTG#", name: "PPH 21 Dipotong" }).key,
  "pph21",
);
assert.equal(
  findRuleForComponent({ code: "#POT_SPSI#", name: "Potongan SPSI" }).key,
  "spsi",
);
assert.equal(
  findRuleForComponent({
    code: "#JP_TK#",
    name: "JAMINAN PENSIUN DITANGGUNG KARYAWAN",
  }),
  null,
);
assert.equal(
  findRuleForComponent({
    code: "#KES_TK#",
    name: "BPJS KESEHATAN DITANGGUNG KARYAWAN",
  }),
  null,
);
assert.equal(
  findRuleForComponent({ code: "#UNKNOWN#", name: "Komponen Baru" }),
  null,
);

assert.equal(
  findTaskCode(
    findRuleForComponent({ name: "Tunjangan Masa Kerja" }),
    taskCodes,
  ).taskCode,
  "GA9129",
);
assert.equal(
  findTaskCode(findRuleForComponent({ name: "Tunjangan Jabatan" }), taskCodes)
    .taskCode,
  "GA9128",
);
assert.equal(
  findTaskCode(findRuleForComponent({ name: "PPH21" }), taskCodes).taskCode,
  "DEPH21",
);
assert.equal(
  getAutocompleteKeyword(findRuleForComponent({ name: "Tunjangan Masa Kerja" })),
  "MASA KERJA",
);
assert.equal(
  getAutocompleteKeyword(findRuleForComponent({ name: "Tunjangan Jabatan" })),
  "JABATAN",
);
assert.equal(
  getAutocompleteKeyword(findRuleForComponent({ name: "PPH21" })),
  "PPH",
);
assert.equal(
  findTaskCode(findRuleForComponent({ name: "SPSI" }), taskCodes).taskCode,
  "DE0003",
);

const employee = {
  tunjanganDetails: [
    { code: "#TJ_MASAKERJA#", name: "TUNJANGAN MASA KERJA", amount: 100000 },
    {
      code: "#TJ_MASAKERJA#",
      name: "TUNJANGAN MASA KERJA RAPEL",
      amount: 25000,
    },
    { code: "#TJ_JABATAN#", name: "TUNJANGAN JABATAN", amount: 0 },
    { code: "#X#", name: "TUNJANGAN BELUM DIMAPPING", amount: 1000 },
  ],
  potonganDetails: [
    { code: "#PPH21_DIPTG#", name: "PPH 21 DIPOTONG", amount: -50000 },
    { code: "#POT_SPSI#", name: "POTONGAN SPSI", amount: 12000 },
  ],
  sync: {
    masaKerja: { millware: 0 },
    pph21: { millware: 10000 },
    spsi: { millware: 12000 },
  },
};

const grouped = collectPayrollComponentGroups(employee);
assert.equal(
  grouped.groups.find((group) => group.componentKey === "masaKerja")
    .venusAmount,
  125000,
);
assert.equal(
  grouped.groups.find((group) => group.componentKey === "pph21").venusAmount,
  50000,
);
assert.equal(
  grouped.unmapped.some(
    (item) => item.status === "SKIPPED_ZERO" && item.componentKey === "jabatan",
  ),
  true,
);
assert.equal(
  grouped.unmapped.some(
    (item) =>
      item.status === "UNMAPPED" &&
      item.componentName === "TUNJANGAN BELUM DIMAPPING",
  ),
  true,
);

const built = buildPayrollAutomationComponents(employee, taskCodes, 10);
assert.deepEqual(
  built.components.map((component) => component.componentKey),
  ["masaKerja", "pph21"],
);
assert.equal(
  built.components.find((component) => component.componentKey === "masaKerja")
    .adCode,
  "GA9129",
);
assert.equal(
  built.components.find((component) => component.componentKey === "masaKerja")
    .adSearchKeyword,
  "MASA KERJA",
);
assert.equal(
  built.components.find((component) => component.componentKey === "pph21")
    .venusAmount,
  50000,
);
assert.equal(
  built.diagnostics.some(
    (item) => item.status === "MATCH" && item.componentKey === "spsi",
  ),
  true,
);

const unmappedTaskCode = buildPayrollAutomationComponents(
  {
    tunjanganDetails: [
      { code: "#TJ_MASAKERJA#", name: "TUNJANGAN MASA KERJA", amount: 100000 },
    ],
    potonganDetails: [],
    sync: { masaKerja: { millware: 0 } },
  },
  [],
  10,
);
assert.equal(unmappedTaskCode.components.length, 0);
assert.equal(
  unmappedTaskCode.diagnostics.some(
    (item) => item.status === "UNMAPPED" && item.componentKey === "masaKerja",
  ),
  true,
);

console.log("payrollComponentMapping tests passed");
