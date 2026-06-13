const { executeQuery } = require('./gateway');
const { getAllEmployees } = require('./employeeMillService');
const { fetchMillwarePayroll } = require('./payrollComparisonService');
const { getPayrollComponentKey } = require('./payrollComponentMapping');
const {
    buildPayrollResultFromSnapshot,
    buildPayrollResultFromActiveSnapshot
} = require('./payrollSnapshotService');

const PAYROLL_TOLERANCE = 50;

const toNumber = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeText = (value) => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

const isCompanyPaidBenefit = (component = {}) => {
    const name = normalizeText(component.name || component.PYCompName);
    const code = normalizeText(component.code || component.PYCompCode);
    const text = `${name} ${code}`;

    return (
        text.includes('DITANGGUNG PERUSAHAAN') ||
        text.includes('JAMINAN KECELAKAAN KERJA') ||
        text.includes('JAMINAN KEMATIAN') ||
        text.includes('BPJS KESEHATAN DITANGGUNG PERUSAHAAN')
    ) && (
        text.includes('JAMINAN') ||
        text.includes('BPJS') ||
        text.includes('JHT') ||
        text.includes('JKK') ||
        text.includes('JKM') ||
        text.includes('PENSIUN')
    );
};

const isEmployeeAutoDeduction = (component = {}) => {
    const name = normalizeText(component.name || component.PYCompName);
    const code = normalizeText(component.code || component.PYCompCode);
    const text = `${name} ${code}`;

    return (
        text.includes('DITANGGUNG KARYAWAN') ||
        text.includes('PINJAMAN PRIBADI') ||
        text.includes('POTONGAN ABSEN') ||
        text.includes('POTONGAN BPJS TAMBAHAN') ||
        text.includes('POTONGAN LAIN-LAIN')
    ) && !text.includes('PPH') && !text.includes('SPSI');
};

const calculateEffectiveMillwareNetpay = (mw, venusAutoDeductions) => {
    if (!mw) return 0;

    const bpjsKesMillware = Math.abs(toNumber(mw.potongan_bpjs_kesehatan));
    const bpjsPenMillware = Math.abs(toNumber(mw.potongan_bpjs_pensiun));
    const otherMillware = Math.abs(toNumber(mw.potongan_lain));
    const bpjsKesAuto = Math.max(toNumber(venusAutoDeductions.bpjsKes) - bpjsKesMillware, 0);
    const bpjsPenAuto = Math.max(toNumber(venusAutoDeductions.bpjsPen) - bpjsPenMillware, 0);
    const otherAuto = Math.max(toNumber(venusAutoDeductions.other) - otherMillware, 0);

    return toNumber(mw.upah_bersih) - bpjsKesAuto - bpjsPenAuto - otherAuto;
};

const buildNetpayAnalysis = (rows) => {
    const componentKeys = [
        'gajiPokok',
        'lembur',
        'jabatan',
        'beras',
        'masaKerja',
        'premi',
        'pph21',
        'bpjsKes',
        'bpjsPen',
        'spsi',
        'upahBersih'
    ];

    const initialComponentTotals = componentKeys.reduce((acc, key) => {
        acc[key] = { venus: 0, millware: 0, diff: 0, absDiff: 0 };
        return acc;
    }, {});

    const analysis = rows.reduce((acc, row) => {
        const hasMillware = Boolean(row.millware);
        const venusNetpay = toNumber(row.sync?.upahBersih?.venus);
        const millwareNetpay = hasMillware ? toNumber(row.sync?.upahBersih?.millware) : 0;
        const netpayDiff = venusNetpay - millwareNetpay;
        const absNetpayDiff = Math.abs(netpayDiff);

        acc.employeeCount += 1;
        acc.venusNetpayTotal += venusNetpay;
        acc.millwareNetpayTotal += millwareNetpay;

        if (!hasMillware) acc.noMillwareCount += 1;
        else if (absNetpayDiff <= PAYROLL_TOLERANCE) acc.matchCount += 1;
        else acc.mismatchCount += 1;

        if (absNetpayDiff > PAYROLL_TOLERANCE || !hasMillware) {
            acc.problemRows.push({
                id: row.id,
                name: row.name,
                ptrjId: row.ptrjId,
                hasMillware,
                venusNetpay,
                millwareNetpay,
                diff: netpayDiff,
                absDiff: absNetpayDiff,
                status: hasMillware ? 'MISMATCH' : 'NO_MILLWARE'
            });
        }

        componentKeys.forEach((key) => {
            const venus = toNumber(row.sync?.[key]?.venus);
            const millware = hasMillware ? toNumber(row.sync?.[key]?.millware) : 0;
            const diff = venus - millware;
            acc.componentTotals[key].venus += venus;
            acc.componentTotals[key].millware += millware;
            acc.componentTotals[key].diff += diff;
            acc.componentTotals[key].absDiff += Math.abs(diff);
        });

        return acc;
    }, {
        employeeCount: 0,
        matchCount: 0,
        mismatchCount: 0,
        noMillwareCount: 0,
        venusNetpayTotal: 0,
        millwareNetpayTotal: 0,
        componentTotals: initialComponentTotals,
        problemRows: []
    });

    analysis.netpayDiff = analysis.venusNetpayTotal - analysis.millwareNetpayTotal;
    analysis.netpayAbsDiff = Math.abs(analysis.netpayDiff);
    analysis.problemRows.sort((a, b) => b.absDiff - a.absDiff);
    analysis.topProblemRows = analysis.problemRows.slice(0, 25);
    analysis.componentRanking = Object.entries(analysis.componentTotals)
        .map(([key, totals]) => ({ key, ...totals }))
        .sort((a, b) => b.absDiff - a.absDiff);

    return analysis;
};

/**
 * Fetch payroll details for a specific month and year
 * @param {number} month - 1-12
 * @param {number} year - YYYY
 */
const fetchLivePayrollData = async (month, year) => {
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
                py.tunjanganDetails.push({
                    code: dRow.PYCompCode,
                    name: dRow.PYCompName,
                    amount: amount,
                    type: dRow.PYType,
                    isTHP
                });
            } else if (dRow.PYType === 'Deduction') {
                py.potonganTotal += amount;
                py.potonganDetails.push({
                    code: dRow.PYCompCode,
                    name: dRow.PYCompName,
                    amount: amount,
                    type: dRow.PYType,
                    isTHP
                });
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
            // Lembur breakdown: OT1, OT2, OT3 (exclude MINUS_OVT from total)
            let vLemburOT1 = 0, vLemburOT2 = 0, vLemburOT3 = 0, vLemburMinusOvt = 0;
            let vJabatan = 0, vBeras = 0, vMasaKerja = 0, vPremi = 0, vCompanyPaidBenefits = 0;
            const companyPaidBenefitDetails = [];
            py.tunjanganDetails.forEach(d => {
                const key = getPayrollComponentKey(d);
                const code = String(d.code || d.PYCompCode || '').toUpperCase();
                const name = String(d.name || d.PYCompName || '').toUpperCase();

                // Lembur breakdown by code
                if (code === '#OT1#' || name.includes('OT JAM KE-1') || name.includes('OT JAM KE 1')) {
                    vLemburOT1 += d.amount;
                } else if (code === '#OT2#' || name.includes('OT JAM KE-2') || name.includes('OT JAM KE 2')) {
                    vLemburOT2 += d.amount;
                } else if (code === '#OT3#' || name.includes('OT JAM KE-3') || name.includes('OT JAM KE 3')) {
                    vLemburOT3 += d.amount;
                } else if (code === '#MINUS_OVT#' || (name.includes('KURANG') && name.includes('BAYAR') && name.includes('OVERTIME'))) {
                    // Kurang bayar overtime - track separately, exclude from total
                    vLemburMinusOvt += d.amount;
                } else if (key === 'lembur') {
                    // Generic lembur fallback (should not match after code-specific checks above)
                    vLemburOT1 += d.amount; // Treat as OT1 if generic
                }

                if (key === 'jabatan') vJabatan += d.amount;
                else if (key === 'beras') vBeras += d.amount;
                else if (key === 'masaKerja') vMasaKerja += d.amount;
                else if (key === 'premi') vPremi += d.amount;

                if (isCompanyPaidBenefit(d)) {
                    const amount = Math.abs(toNumber(d.amount));
                    vCompanyPaidBenefits += amount;
                    companyPaidBenefitDetails.push({
                        code: d.code,
                        name: d.name,
                        amount
                    });
                }
            });

            // Total Venus Lembur = OT1 + OT2 + OT3 (exclude MINUS_OVT)
            const vLembur = vLemburOT1 + vLemburOT2 + vLemburOT3;

            let vPph21 = 0, vBpjsKes = 0, vBpjsPen = 0, vSpsi = 0, vOtherAutoDeductions = 0;
            const otherAutoDeductionDetails = [];
            py.potonganDetails.forEach(d => {
                const key = getPayrollComponentKey(d);
                if (key === 'pph21') vPph21 += Math.abs(d.amount);
                else if (key === 'bpjsKes') vBpjsKes += Math.abs(d.amount);
                else if (key === 'bpjsPen') vBpjsPen += Math.abs(d.amount);
                else if (key === 'spsi') vSpsi += Math.abs(d.amount);

                if (isEmployeeAutoDeduction(d) && key !== 'bpjsKes' && key !== 'bpjsPen') {
                    const amount = Math.abs(toNumber(d.amount));
                    vOtherAutoDeductions += amount;
                    otherAutoDeductionDetails.push({
                        code: d.code,
                        name: d.name,
                        amount
                    });
                }
            });

            const effectiveMillwareNetpay = calculateEffectiveMillwareNetpay(mw, {
                bpjsKes: vBpjsKes,
                bpjsPen: vBpjsPen,
                other: vOtherAutoDeductions
            });

            const effectiveMillware = mw ? {
                ...mw,
                auto_tunjangan_perusahaan: vCompanyPaidBenefits,
                auto_tunjangan_perusahaan_details: companyPaidBenefitDetails,
                auto_potongan_bpjs_kesehatan: Math.max(vBpjsKes - Math.abs(toNumber(mw.potongan_bpjs_kesehatan)), 0),
                auto_potongan_bpjs_pensiun: Math.max(vBpjsPen - Math.abs(toNumber(mw.potongan_bpjs_pensiun)), 0),
                auto_potongan_lain: Math.max(vOtherAutoDeductions - Math.abs(toNumber(mw.potongan_lain)), 0),
                auto_potongan_lain_details: otherAutoDeductionDetails,
                upah_bersih_raw: mw.upah_bersih || 0,
                upah_bersih: effectiveMillwareNetpay
            } : null;

            // Helper to determine component status
            // Special handling for beras: if one side has value and other is zero, it's a MISS
            const getComponentStatus = (key, venusVal, millwareVal) => {
                const venus = Math.abs(venusVal);
                const millware = Math.abs(millwareVal);
                const diff = Math.abs(venus - millware);

                // Special case for beras: missing in one system is always a difference
                if (key === 'beras') {
                    const oneSideHasValue = (venus > 0) !== (millware > 0);
                    if (oneSideHasValue) {
                        return {
                            status: 'MISS',
                            missingIn: venus === 0 ? 'Venus' : 'Millware',
                            isMissingComponent: true
                        };
                    }
                }

                // Standard tolerance check
                if (diff <= PAYROLL_TOLERANCE) {
                    return { status: 'MATCH', diff };
                }
                return { status: 'MISS', diff };
            };

            const sync = {
                isSynced: false,
                gajiPokok: { venus: py.gajiPokok, millware: mw ? mw.gaji_pokok || 0 : 0 },
                lembur: {
                    venus: vLembur,
                    millware: mw ? mw.tunjangan_lembur || 0 : 0,
                    venusDetail: {
                        ot1: vLemburOT1,
                        ot2: vLemburOT2,
                        ot3: vLemburOT3,
                        minusOvt: vLemburMinusOvt
                    },
                    millwareDetail: mw ? {
                        taskreg: mw.tunjangan_lembur_taskreg || mw.tunjangan_lembur || 0,
                        adtrans: mw.tunjangan_lembur_adtrans || 0
                    } : null
                },
                jabatan: { venus: vJabatan, millware: mw ? mw.tunjangan_jabatan || 0 : 0 },
                beras: { venus: vBeras, millware: mw ? mw.tunjangan_beras || 0 : 0 },
                masaKerja: { venus: vMasaKerja, millware: mw ? mw.tunjangan_masa_kerja || 0 : 0 },
                premi: {
                    venus: vPremi,
                    millware: mw ? mw.premi_total || 0 : 0
                },
                pph21: { venus: vPph21, millware: mw ? Math.abs(mw.potongan_pph21 || 0) : 0 },
                bpjsKes: { venus: vBpjsKes, millware: mw ? Math.abs(mw.potongan_bpjs_kesehatan || 0) : 0 },
                bpjsPen: { venus: vBpjsPen, millware: mw ? Math.abs(mw.potongan_bpjs_pensiun || 0) : 0 },
                spsi: { venus: vSpsi, millware: mw ? Math.abs(mw.potongan_spsi || 0) : 0 },
                upahBersih: { venus: py.upahBersih, millware: effectiveMillwareNetpay }
            };

            // Get status for each component (especially beras)
            sync.berasStatus = getComponentStatus('beras', sync.beras.venus, sync.beras.millware);

            if (mw) {
                const isMatch = (a, b) => Math.abs(a - b) <= PAYROLL_TOLERANCE;
                sync.isSynced = isMatch(sync.gajiPokok.venus, sync.gajiPokok.millware) &&
                    isMatch(sync.lembur.venus, sync.lembur.millware) &&
                    isMatch(sync.jabatan.venus, sync.jabatan.millware) &&
                    isMatch(sync.masaKerja.venus, sync.masaKerja.millware) &&
                    isMatch(sync.premi.venus, sync.premi.millware) &&
                    isMatch(sync.pph21.venus, sync.pph21.millware) &&
                    isMatch(sync.spsi.venus, sync.spsi.millware) &&
                    isMatch(sync.upahBersih.venus, sync.upahBersih.millware) &&
                    sync.berasStatus.status === 'MATCH'; // Include beras in sync check
            }

            return {
                ...py,
                millware: effectiveMillware,
                sync
            };
        });

        return {
            success: true,
            data: finalData,
            analysis: buildNetpayAnalysis(finalData),
            sourceInfo: {
                source: 'live',
                month: Number(month),
                year: Number(year),
                fetchedAt: new Date().toISOString()
            }
        };

    } catch (e) {
        console.error("fetchPayrollData Error:", e);
        return {
            success: false,
            error: e.message
        };
    }
};

const fetchPayrollData = async (month, year, options = {}) => {
    const source = String(options.source || (options.snapshotId || options.useActiveSnapshot ? 'snapshot' : 'live')).toLowerCase();

    if (source === 'snapshot') {
        if (options.snapshotId) {
            return buildPayrollResultFromSnapshot(options.snapshotId);
        }
        return buildPayrollResultFromActiveSnapshot(month, year);
    }

    return fetchLivePayrollData(month, year);
};

module.exports = {
    fetchPayrollData,
    fetchLivePayrollData,
    buildNetpayAnalysis
};
