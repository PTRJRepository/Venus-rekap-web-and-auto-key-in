const express = require('express');
const cors = require('cors');
const { fetchAttendanceData } = require('./services/attendanceService');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/attendance', async (req, res) => {
    const { month, year } = req.query;
    console.log(`Received request for ${month}/${year}`);
    
    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        const data = await fetchAttendanceData(parseInt(month), parseInt(year));
        res.json(data);
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));