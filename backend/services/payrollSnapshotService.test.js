const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const snapshotService = require('./payrollSnapshotService');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-snapshot-'));
const dbPath = path.join(tmpDir, 'snapshot.db');
snapshotService._setDatabasePathForTests(dbPath);

const samplePayroll = {
    success: true,
    data: [
        {
            id: 'PTRJ.001',
            name: 'Employee One',
            ptrjId: 'POM00001',
            chargeJob: 'TASK|ST|MC|EXP',
            gajiPokok: 1000000,
            tunjanganTotal: 250000,
            potonganTotal: 50000,
            upahBersih: 1200000,
            tunjanganDetails: [
                { code: '#TJ_BERAS#', name: 'TUNJANGAN BERAS', amount: 150000, type: 'Addition' }
            ],
            potonganDetails: [
                { code: '#POT_SPSI#', name: 'POTONGAN SPSI', amount: 50000, type: 'Deduction' }
            ],
            millware: {
                emp_code: 'POM00001',
                tunjangan_beras: 100000,
                upah_bersih: 1150000
            },
            sync: {
                isSynced: false,
                gajiPokok: { venus: 1000000, millware: 1000000 },
                lembur: { venus: 0, millware: 0 },
                jabatan: { venus: 0, millware: 0 },
                beras: { venus: 150000, millware: 100000 },
                masaKerja: { venus: 0, millware: 0 },
                premi: { venus: 0, millware: 0 },
                pph21: { venus: 0, millware: 0 },
                bpjsKes: { venus: 0, millware: 0 },
                bpjsPen: { venus: 0, millware: 0 },
                spsi: { venus: 50000, millware: 50000 },
                upahBersih: { venus: 1200000, millware: 1150000 },
                berasStatus: { status: 'MISS', diff: 50000 }
            }
        }
    ],
    analysis: {
        employeeCount: 1,
        matchCount: 0,
        mismatchCount: 1,
        noMillwareCount: 0,
        venusNetpayTotal: 1200000,
        millwareNetpayTotal: 1150000,
        netpayDiff: 50000
    },
    sourceInfo: { source: 'live' }
};

(async () => {
    await snapshotService.initPayrollSnapshotDB();
    const created = await snapshotService.createPayrollSnapshot({
        month: 6,
        year: 2026,
        label: 'June payroll freeze',
        notes: 'test snapshot',
        payrollResult: samplePayroll,
        setActive: true,
        capturedBy: 'test'
    });

    assert.equal(created.label, 'June payroll freeze');
    assert.equal(created.isActive, true);
    assert.equal(created.employeeCount, 1);
    assert.equal(created.componentCount, 11);

    const snapshots = await snapshotService.listPayrollSnapshots(6, 2026);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].id, created.id);

    const active = await snapshotService.getActivePayrollSnapshot(6, 2026);
    assert.equal(active.id, created.id);

    const snapshotResult = await snapshotService.buildPayrollResultFromSnapshot(created.id);
    assert.equal(snapshotResult.success, true);
    assert.equal(snapshotResult.sourceInfo.source, 'snapshot');
    assert.equal(snapshotResult.data[0].name, 'Employee One');
    assert.equal(snapshotResult.data[0].sync.beras.venus, 150000);
    assert.equal(snapshotResult.analysis.netpayDiff, 50000);

    const updated = await snapshotService.updatePayrollSnapshot(created.id, { label: 'Updated freeze' });
    assert.equal(updated.label, 'Updated freeze');

    const deleted = await snapshotService.softDeletePayrollSnapshot(created.id, 'test');
    assert.deepEqual(deleted, { id: created.id, deleted: true });
    assert.equal(await snapshotService.getPayrollSnapshot(created.id), null);

    console.log('payrollSnapshotService tests passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
