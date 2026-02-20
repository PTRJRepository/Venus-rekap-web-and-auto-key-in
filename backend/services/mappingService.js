const { getAllEmployees } = require('./employeeMillService');

// Cache the mapping object
let cachedMapping = null;
let lastCacheTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

const loadMappingFromDB = async () => {
    try {
        console.log('Fetching PTRJ Mapping from Database...');
        const records = await getAllEmployees();
        const mapping = {};

        records.forEach(record => {
            const nik = record.nik;
            const ptrjId = record.ptrj_employee_id;
            const ptrjName = record.employee_name || '';

            if (!ptrjId) return;

            const ptrjCode = ptrjId.trim();

            // Priority 1: ID (NIK)
            if (nik) {
                mapping[`id:${nik}`] = ptrjCode;
            }

            // Priority 2: Name variants
            if (ptrjName) {
                const name = ptrjName.trim();
                mapping[`name:${name}`] = ptrjCode;
                mapping[`name:${name.toLowerCase()}`] = ptrjCode;
                mapping[`name:${name.replace(/\s/g, '').toLowerCase()}`] = ptrjCode;
            }
        });

        console.log(`Loaded ${Object.keys(mapping).length} PTRJ mapping entries from DB.`);
        return mapping;
    } catch (error) {
        console.error('Error loading employee mapping from DB:', error);
        return {};
    }
};

const getPTRJMapping = async () => {
    if (cachedMapping && (Date.now() - lastCacheTime < CACHE_DURATION)) {
        return cachedMapping;
    }
    cachedMapping = await loadMappingFromDB();
    lastCacheTime = Date.now();
    return cachedMapping;
};

const matchPTRJEmployeeId = (venusEmployee, mapping) => {
    if (!venusEmployee || !mapping) return "N/A";

    const venusIdNo = venusEmployee.IDNo ? venusEmployee.IDNo.trim() : null;
    const venusName = venusEmployee.EmployeeName ? venusEmployee.EmployeeName.trim() : '';

    // Priority 1: ID Match
    if (venusIdNo) {
        const idKey = `id:${venusIdNo}`;
        if (mapping[idKey]) return mapping[idKey];
    }

    // Priority 2: Name Match
    if (!venusName) return "N/A";

    // Exact
    if (mapping[`name:${venusName}`]) return mapping[`name:${venusName}`];

    // Lowercase
    const lowerName = venusName.toLowerCase();
    if (mapping[`name:${lowerName}`]) return mapping[`name:${lowerName}`];

    // No Spaces
    const noSpaceName = lowerName.replace(/\s/g, '');
    if (mapping[`name:${noSpaceName}`]) return mapping[`name:${noSpaceName}`];

    // console.log(`[DEBUG] No match for ${venusName} (${venusIdNo})`);
    return "N/A";
};

module.exports = { getPTRJMapping, matchPTRJEmployeeId };
