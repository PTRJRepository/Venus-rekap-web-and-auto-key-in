const { executeQuery } = require('./gateway');
const { getAllEmployees } = require('./employeeMillService');
const { fetchMillwarePayroll } = require('./payrollComparisonService');

/**
 * Fetch payroll details for a specific month and year
 * @param {number} month - 1-12
 * @param {number} year - YYYY
 */
const fetchPayrollData = async (month, year) => {
    try {
        console.log(`[PayrollService] Fetching payroll for ${month}/${year}`);
        const period = `${year}${String(month).padStart(2, '0')}`;

        const mTableQuery = `
            SELECT EmployeeID, PYNumber, PYDate
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_M]
            WHERE PYNumber LIKE 'PYW/PTRJ/${period}/%'
        `;
        const mData = await executeQuery(mTableQuery);

        const dTableQuery = `
            SELECT PYNumber, PYCompCode, PYCompName, CompAmount, PYType, IsTakeHomePay
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_DComponent]
            WHERE PYNumber LIKE 'PYW/PTRJ/${period}/%'
        `;
        const dData = await executeQuery(dTableQuery);

        // Get local mappings
        const millEmployees = await getAllEmployees();
        const millMap = {};
        millEmployees.forEach(me => {
            if (me.venus_employee_id) millMap[me.venus_employee_id] = me;
        });

        // Grouping
        const payrollByEmp = {};

        mData.forEach(mRow => {
            const empId = mRow.EmployeeID;

            let mapData = millMap[empId];
            if (!mapData && empId.startsWith('PTRJ.')) {
                mapData = millMap[empId.replace('PTRJ.', '')];
            }

            payrollByEmp[mRow.PYNumber] = {
                id: empId,
                name: mapData ? mapData.employee_name : empId,
                ptrjId: mapData ? mapData.ptrj_employee_id : '-',
                chargeJob: mapData ? mapData.charge_job : '-',
                gajiPokok: 0,
                tunjanganTotal: 0,
                potonganTotal: 0,
                upahBersih: 0,
                tunjanganDetails: [],
                potonganDetails: []
            };
        });

        dData.forEach(dRow => {
            const py = payrollByEmp[dRow.PYNumber];
            if (!py) return;

            const amount = parseFloat(dRow.CompAmount) || 0;
            const isTHP = dRow.IsTakeHomePay === true || dRow.IsTakeHomePay === 1;

            if (isTHP) {
                py.upahBersih += amount;
            }

            if (dRow.PYCompCode === '#GP#') {
                py.gajiPokok += amount;
            } else if (dRow.PYType === 'Addition' && dRow.PYCompCode !== '#GP#') {
                py.tunjanganTotal += amount;
                py.tunjanganDetails.push({ name: dRow.PYCompName, amount: amount, isTHP });
            } else if (dRow.PYType === 'Deduction') {
                py.potonganTotal += amount;
                py.potonganDetails.push({ name: dRow.PYCompName, amount: amount, isTHP });
            }
        });

        // Fetch Millware Comparison Data
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const finalValues = Object.values(payrollByEmp);
        const ptrjIds = [...new Set(finalValues.map(py => py.ptrjId).filter(id => id && id !== '-'))];

        let millwareData = {};
        if (ptrjIds.length > 0) {
            millwareData = await fetchMillwarePayroll(ptrjIds, startDate, endDate);
        }

        const finalData = finalValues.map(py => {
            const mw = millwareData[py.ptrjId] || null;

            // Calculate Venus aggregations for comparison
            let vLembur = 0, vJabatan = 0, vBeras = 0, vMasaKerja = 0, vPremi = 0;
            py.tunjanganDetails.forEach(d => {
                const n = d.name.toUpperCase();
                if (n.includes('OT JAM') || n.includes('LEMBUR')) vLembur += d.amount;
                else if (n.includes('JABATAN')) vJabatan += d.amount;
                else if (n.includes('BERAS')) vBeras += d.amount;
                else if (n.includes('MASA KERJA')) vMasaKerja += d.amount;
                else if (n.includes('PREMI') || n.includes('PANEN') || n.includes('KINERJA') || n.includes('BRONDOL') || n.includes('INSENTIF')) vPremi += d.amount;
            });

            let vPph21 = 0, vBpjsKes = 0, vBpjsPen = 0, vSpsi = 0;
            py.potonganDetails.forEach(d => {
                const n = d.name.toUpperCase();
                if (n.includes('PPH21')) vPph21 += Math.abs(d.amount);
                else if (n.includes('BPJS KESEHATAN DITANGGUNG KARYAWAN')) vBpjsKes += Math.abs(d.amount);
                else if (n.includes('PENSIUN DITANGGUNG KARYAWAN') || n.includes('JHT')) vBpjsPen += Math.abs(d.amount);
                else if (n.includes('SPSI')) vSpsi += Math.abs(d.amount);
            });

            const sync = {
                isSynced: false,
                lembur: { venus: vLembur, millware: mw ? mw.tunjangan_lembur || 0 : 0 },
                jabatan: { venus: vJabatan, millware: mw ? mw.tunjangan_jabatan || 0 : 0 },
                beras: { venus: vBeras, millware: mw ? mw.tunjangan_beras || 0 : 0 },
                masaKerja: { venus: vMasaKerja, millware: mw ? mw.tunjangan_masa_kerja || 0 : 0 },
                premi: {
                    venus: vPremi,
                    millware: mw ? (mw.premi_panen || 0) + (mw.premi_kinerja || 0) + (mw.premi_brondol || 0) + (mw.premi_insentif || 0) + (mw.premi_lain || 0) : 0
                },
                pph21: { venus: vPph21, millware: mw ? Math.abs(mw.potongan_pph21 || 0) : 0 },
                bpjsKes: { venus: vBpjsKes, millware: mw ? Math.abs(mw.potongan_bpjs_kesehatan || 0) : 0 },
                bpjsPen: { venus: vBpjsPen, millware: mw ? Math.abs(mw.potongan_bpjs_pensiun || 0) : 0 },
                spsi: { venus: vSpsi, millware: mw ? Math.abs(mw.potongan_spsi || 0) : 0 }
            };

            if (mw) {
                const isMatch = (a, b) => Math.abs(a - b) < 10; // 10 rupiah tolerance
                sync.isSynced = isMatch(sync.jabatan.venus, sync.jabatan.millware) &&
                    isMatch(sync.masaKerja.venus, sync.masaKerja.millware) &&
                    isMatch(sync.premi.venus, sync.premi.millware) &&
                    isMatch(sync.pph21.venus, sync.pph21.millware) &&
                    isMatch(sync.spsi.venus, sync.spsi.millware);
            }

            return {
                ...py,
                millware: mw,
                sync
            };
        });

        return {
            success: true,
            data: finalData
        };

    } catch (e) {
        console.error("fetchPayrollData Error:", e);
        return {
            success: false,
            error: e.message
        };
    }
};

module.exports = {
    fetchPayrollData
};
