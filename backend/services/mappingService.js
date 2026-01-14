const fs = require('fs');
const path = require('path');

const MAPPING_FILE_PATH = path.join(__dirname, '../../../data/employee_id_mapping.json');

const loadMapping = () => {
    try {
        if (!fs.existsSync(MAPPING_FILE_PATH)) {
            console.warn(`Mapping file not found at ${MAPPING_FILE_PATH}`);
            return {};
        }
        const rawData = fs.readFileSync(MAPPING_FILE_PATH, 'utf-8');
        const jsonData = JSON.parse(rawData);
        const mappingRecords = jsonData.mapping || [];

        const mapping = {};

        mappingRecords.forEach(record => {
            if (record.mapping_status !== 'matched') return;

            const nik = record.nik;
            const ptrjId = record.ptrj_employee_id;
            const ptrjName = record.ptrj_employee_name || '';

            if (!ptrjId) return;

            const ptrjCode = ptrjId.trim();

            // Priority 1: ID (NIK)
            if (nik) {
                mapping[`id:${nik}`] = ptrjCode;
            }

            // Priority 2: Name variants
            if (ptrjName) {
                mapping[`name:${ptrjName}`] = ptrjCode;
                mapping[`name:${ptrjName.toLowerCase().trim()}`] = ptrjCode;
                mapping[`name:${ptrjName.replace(/\s/g, '').toLowerCase()}`] = ptrjCode;
            }
        });

        console.log(`Loaded ${Object.keys(mapping).length} mapping entries.`);
        return mapping;
    } catch (error) {
        console.error('Error loading employee mapping:', error);
        return {};
    }
};

let cachedMapping = null;

const getPTRJMapping = () => {
    if (!cachedMapping) {
        cachedMapping = loadMapping();
    }
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

    return "N/A";
};

module.exports = { getPTRJMapping, matchPTRJEmployeeId };
