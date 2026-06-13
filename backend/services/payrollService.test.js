const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let liveQueryCount = 0;
const gatewayPath = path.resolve(__dirname, 'gateway.js');
const employeePath = path.resolve(__dirname, 'employeeMillService.js');
const comparisonPath = path.resolve(__dirname, 'payrollComparisonService.js');

require.cache[gatewayPath] = {
    id: gatewayPath,
    filename: gatewayPath,
    loaded: true,
    exports: {
        executeQuery: async () => {
            liveQueryCount += 1;
            throw new Error('Live gateway should not be called for snapshot source');
        }
    }
};

require.cache[employeePath] = {
    id: employeePath,
    filename: employeePath,
    loaded: true,
    exports: {
        getAllEmployees: async () => {
            liveQueryCount += 1;
            throw new Error('Employee mapping should not be called for snapshot source');
        }
    }
};

require.cache[comparisonPath] = {
    id: comparisonPath,
    filename: comparisonPath,
    loaded: true,
    exports: {
        fetchMillwarePayroll: async () => {
            liveQueryCount += 1;
            throw new Error('Millware payroll should not be called for snapshot source');
        }
    }
};

const snapshotService = require('./payrollSnapshotService');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-service-snapshot-'));
snapshotService._setDatabasePathForTests(path.join(tmpDir, 'snapshot.db'));

const { fetchPayrollData } = require('./payrollService');

(async () => {
    await snapshotService.initPayrollSnapshotDB();
    const snapshot = await snapshotService.createPayrollSnapshot({
        month: 6,
        year: 2026,
        label: 'Snapshot source test',
        payrollResult: {
            success: true,
            data: [
                {
                    id: 'E1',
                    name: 'Snapshot Employee',
                    ptrjId: 'POM001',
                    chargeJob: '-',
                    gajiPokok: 1,
                    tunjanganTotal: 0,
                    potonganTotal: 0,
                    upahBersih: 1,
                    tunjanganDetails: [],
                    potonganDetails: [],
                    millware: null,
                    sync: {
                        isSynced: false,
                        gajiPokok: { venus: 1, millware: 0 },
                        lembur: { venus: 0, millware: 0 },
                        jabatan: { venus: 0, millware: 0 },
                        beras: { venus: 0, millware: 0 },
                        masaKerja: { venus: 0, millware: 0 },
                        premi: { venus: 0, millware: 0 },
                        pph21: { venus: 0, millware: 0 },
                        bpjsKes: { venus: 0, millware: 0 },
                        bpjsPen: { venus: 0, millware: 0 },
                        spsi: { venus: 0, millware: 0 },
                        upahBersih: { venus: 1, millware: 0 }
                    }
                }
            ],
            analysis: { employeeCount: 1, netpayDiff: 1 }
        },
        setActive: true
    });

    const byId = await fetchPayrollData(6, 2026, { source: 'snapshot', snapshotId: snapshot.id });
    assert.equal(byId.success, true);
    assert.equal(byId.sourceInfo.source, 'snapshot');
    assert.equal(byId.data[0].name, 'Snapshot Employee');

    const active = await fetchPayrollData(6, 2026, { source: 'snapshot' });
    assert.equal(active.success, true);
    assert.equal(active.sourceInfo.snapshotId, snapshot.id);
    assert.equal(liveQueryCount, 0);

    console.log('payrollService snapshot source tests passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
