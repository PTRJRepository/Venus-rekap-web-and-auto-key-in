const assert = require('node:assert/strict');
const path = require('node:path');

const gatewayPath = path.resolve(__dirname, 'gateway.js');
const comparisonServicePath = path.resolve(__dirname, 'payrollComparisonService.js');

require.cache[gatewayPath] = {
    id: gatewayPath,
    filename: gatewayPath,
    loaded: true,
    exports: {
        executeQuery: async (sql) => {
            if (sql.includes('HR_PAYROLL')) {
                return [{ emp_code: 'POM001', PayRate: 100000, RiceRation: 10000 }];
            }

            if (sql.includes('WITH WorkLines')) {
                return [{
                    emp_code: 'POM001',
                    total_hk: 2,
                    total_lembur_amount: 5000,
                    total_lembur_hours: 1
                }];
            }

            if (sql.includes('WITH Components')) {
                return [{
                    emp_code: 'POM001',
                    tunjangan_jabatan: 0,
                    tunjangan_beras_manual: 0,
                    tunjangan_masa_kerja: 0,
                    premi_panen: 0,
                    premi_kinerja: 0,
                    premi_brondol: 0,
                    premi_insentif: 0,
                    premi_lain: 0,
                    potongan_pph21: 10000,
                    potongan_bpjs_kes: 0,
                    potongan_bpjs_pen: 0,
                    potongan_spsi: 24000,
                    lainnya: 0
                }];
            }

            throw new Error(`Unexpected query: ${sql}`);
        }
    }
};

delete require.cache[comparisonServicePath];

const {
    fetchMillwarePayroll,
    normalizeSpsiDeduction
} = require('./payrollComparisonService');

assert.equal(normalizeSpsiDeduction(24000, 4), 12000);
assert.equal(normalizeSpsiDeduction(24000, 5), 24000);

Promise.all([
    fetchMillwarePayroll(['POM001'], '2026-04-01', '2026-05-01'),
    fetchMillwarePayroll(['POM001'], '2026-05-01', '2026-06-01')
]).then(([april, may]) => {
    assert.equal(april.POM001.potongan_spsi, 12000);
    assert.equal(april.POM001.potongan_total, 22000);
    assert.equal(april.POM001.upah_bersih, 203000);

    assert.equal(may.POM001.potongan_spsi, 24000);
    assert.equal(may.POM001.potongan_total, 34000);
    assert.equal(may.POM001.upah_bersih, 191000);

    console.log('payrollComparisonService tests passed');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
