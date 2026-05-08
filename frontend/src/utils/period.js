export const normalizeAttendancePeriod = (period) => {
    const month = Number(period?.month);
    const year = Number(period?.year);

    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;

    return { month, year };
};

export const getFallbackAttendancePeriod = (today = new Date()) => {
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

export const getYearOptions = (selectedYear, today = new Date()) => {
    const currentYear = today.getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear];

    if (selectedYear) years.push(Number(selectedYear));

    return [...new Set(years.filter(Number.isInteger))].sort((a, b) => a - b);
};
