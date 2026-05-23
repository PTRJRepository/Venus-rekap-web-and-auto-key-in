const assert = require('node:assert/strict');
const path = require('node:path');

const gatewayPath = path.resolve(__dirname, 'gateway.js');
const employeeServicePath = path.resolve(__dirname, 'employeeMillService.js');
const comparisonServicePath = path.resolve(__dirname, 'payrollComparisonService.js');
const payrollServicePath = path.resolve(__dirname, 'payrollService.js');

require.cache[gatewayPath] = {
    id: gatewayPath,
    filename: gatewayPath,
    loaded: true,
    exports: {
        executeQuery: async (sql) => {
            if (sql.includes('HR_T_PYWeekly_M')) {
                return [{ EmployeeID: 'EMP001', PYNumber: 'PYW/PTRJ/202604/001', PYDate: '2026-04-30' }];
            }

            if (sql.includes('HR_T_PYWeekly_DComponent')) {
                return [
                    {
                        PYNumber: 'PYW/PTRJ/202604/001',
                        PYCompCode: '#GP#',
                        PYCompName: 'GAJI POKOK',
                        CompAmount: 1000,
                        PYType: 'Addition',
                        IsTakeHomePay: 1
                    },
                    {
                        PYNumber: 'PYW/PTRJ/202604/001',
                        PYCompCode: '#KES_TK#',
                        PYCompName: 'BPJS KESEHATAN DITANGGUNG KARYAWAN',
                        CompAmount: -40,
                        PYType: 'Deduction',
                        IsTakeHomePay: 1
                    },
                    {
                        PYNumber: 'PYW/PTRJ/202604/001',
                        PYCompCode: '#JP_TK#',
                        PYCompName: 'JAMINAN PENSIUN DITANGGUNG KARYAWAN',
                        CompAmount: -60,
                        PYType: 'Deduction',
                        IsTakeHomePay: 1
                    },
                    {
                        PYNumber: 'PYW/PTRJ/202604/001',
                        PYCompCode: '#POT_SPSI#',
                        PYCompName: 'POTONGAN SPSI',
                        CompAmount: -30,
                        PYType: 'Deduction',
                        IsTakeHomePay: 1
                    }
                ];
            }

            throw new Error(`Unexpected query: ${sql}`);
        }
    }
};

require.cache[employeeServicePath] = {
    id: employeeServicePath,
    filename: employeeServicePath,
    loaded: true,
    exports: {
        getAllEmployees: async () => ([{
            venus_employee_id: 'EMP001',
            employee_name: 'Employee One',
            ptrj_employee_id: 'POM001',
            charge_job: 'STAFF'
        }])
    }
};

require.cache[comparisonServicePath] = {
    id: comparisonServicePath,
    filename: comparisonServicePath,
    loaded: true,
    exports: {
        fetchMillwarePayroll: async () => ({
            POM001: {
                emp_code: 'POM001',
                gaji_pokok: 1000,
                tunjangan_lembur: 0,
                tunjangan_jabatan: 0,
                tunjangan_beras: 0,
                tunjangan_masa_kerja: 0,
                premi_total: 0,
                potongan_pph21: 0,
                potongan_bpjs_kesehatan: 0,
                potongan_bpjs_pensiun: 0,
                potongan_spsi: 30,
                potongan_lain: 0,
                potongan_total: 30,
                upah_bersih: 970
            }
        })
    }
};

delete require.cache[payrollServicePath];

const { fetchPayrollData } = require('./payrollService');

fetchPayrollData(4, 2026).then((result) => {
    assert.equal(result.success, true);
    assert.equal(result.data.length, 1);

    const row = result.data[0];
    assert.equal(row.sync.bpjsKes.venus, 40);
    assert.equal(row.sync.bpjsKes.millware, 40);
    assert.equal(row.sync.bpjsPen.venus, 60);
    assert.equal(row.sync.bpjsPen.millware, 60);
    assert.equal(row.sync.upahBersih.venus, 870);
    assert.equal(row.sync.upahBersih.millware, 870);

    assert.equal(row.millware.potongan_bpjs_kesehatan, 40);
    assert.equal(row.millware.potongan_bpjs_pensiun, 60);
    assert.equal(row.millware.potongan_total, 130);
    assert.equal(row.millware.upah_bersih_raw, 970);

    assert.equal(result.analysis.componentTotals.bpjsKes.diff, 0);
    assert.equal(result.analysis.componentTotals.bpjsPen.diff, 0);
    assert.equal(result.analysis.netpayDiff, 0);

    console.log('payrollService tests passed');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
