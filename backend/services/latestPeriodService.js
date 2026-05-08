const buildLatestAttendanceDateQuery = () => `
    SELECT MAX(TADate) AS LatestDate
    FROM (
        SELECT MAX(TADate) AS TADate
        FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary]
        UNION ALL
        SELECT MAX(TADate) AS TADate
        FROM [VenusHR14].[dbo].[HR_T_TAMachineInput_D]
    ) latest_attendance
`;

const getFallbackPeriod = (today = new Date()) => {
    let month = today.getMonth() + 1;
    let year = today.getFullYear();

    if (today.getDate() < 15) {
        month -= 1;
        if (month === 0) {
            month = 12;
            year -= 1;
        }
    }

    return { month, year };
};

const periodFromDate = (dateValue) => {
    if (!dateValue) return null;

    const latestDate = new Date(dateValue);
    if (Number.isNaN(latestDate.getTime())) return null;

    return {
        month: latestDate.getMonth() + 1,
        year: latestDate.getFullYear()
    };
};

const getLatestAttendancePeriod = async (executeQuery, today = new Date()) => {
    const result = await executeQuery(buildLatestAttendanceDateQuery());
    const latestPeriod = periodFromDate(result?.[0]?.LatestDate);

    return latestPeriod || getFallbackPeriod(today);
};

module.exports = {
    buildLatestAttendanceDateQuery,
    getFallbackPeriod,
    getLatestAttendancePeriod,
    periodFromDate
};
