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

export default apiClient;
