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

export default apiClient;
