import axios from 'axios';

// Using relative URL since frontend is served from same backend
const API_BASE_URL = '/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const fetchAttendanceData = async (month, year) => {
    try {
        const response = await apiClient.get('/attendance', {
            params: { month, year },
        });
        // Backend returns { success: true, data: [...] }
        return response.data.data;
    } catch (error) {
        console.error('Error fetching attendance data:', error);
        throw error;
    }
};

export const fetchMonths = async () => {
    try {
        const response = await apiClient.get('/months');
        return response.data.data;
    } catch (error) {
        console.error('Error fetching months:', error);
        throw error;
    }
};

export const fetchActiveEmployees = async (startDate, endDate) => {
    try {
        const response = await apiClient.get('/export-options/employees', {
            params: { start_date: startDate, end_date: endDate }
        });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching active employees:', error);
        throw error;
    }
};

export const exportAttendanceJSON = async (startDate, endDate, employeeIds) => {
    try {
        const response = await apiClient.post('/export', {
            start_date: startDate,
            end_date: endDate,
            employee_ids: employeeIds
        });
        return response.data.data;
    } catch (error) {
        console.error('Error exporting data:', error);
        throw error;
    }
};

// Update employee data in employee_mill table (PTRJ ID, Charge Job)
export const updateEmployeeMill = async (venusEmployeeId, updates) => {
    try {
        const response = await apiClient.patch(`/employee-mill/${venusEmployeeId}`, updates);
        return response.data;
    } catch (error) {
        console.error('Error updating employee:', error);
        throw error;
    }
};

// Fetch comparison data from db_ptrj for sync status indicators
export const fetchComparisonData = async (startDate, endDate, empCodes = null, otFilter = null) => {
    try {
        const params = { start_date: startDate, end_date: endDate };
        if (empCodes && empCodes.length > 0) {
            params.emp_codes = empCodes.join(',');
        }
        if (otFilter !== null) {
            params.ot_filter = otFilter;
        }
        const response = await apiClient.get('/comparison/task-reg', { params });

        // Transform to lookup map: { "PTRJ_ID_YYYY-MM-DD": { hours, taskCode, synced: true } }
        const comparisonMap = {};
        if (response.data.success && response.data.data) {
            response.data.data.forEach(record => {
                const dateStr = record.TrxDate ? record.TrxDate.substring(0, 10) : null;
                if (dateStr && record.EmpCode) {
                    const key = `${record.EmpCode}_${dateStr}`;
                    if (!comparisonMap[key]) {
                        comparisonMap[key] = {
                            hours: 0,
                            records: [],
                            synced: true
                        };
                    }
                    comparisonMap[key].hours += parseFloat(record.Hours || 0);
                    comparisonMap[key].records.push(record);
                }
            });
        }
        return comparisonMap;
    } catch (error) {
        console.error('Error fetching comparison data:', error);
        throw error;
    }
};

export default apiClient;

