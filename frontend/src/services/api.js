import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

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
        return response.data;
    } catch (error) {
        console.error('Error fetching attendance data:', error);
        throw error;
    }
};

export default apiClient;
