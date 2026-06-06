const flattenDocIdValues = (input) => {
    if (Array.isArray(input)) return input.flatMap(item => flattenDocIdValues(item));
    if (input === undefined || input === null) return [];
    return String(input).split(/[\s,;]+/);
};

const parseDocIdsInput = (input) => {
    const seen = new Set();
    return flattenDocIdValues(input)
        .map(value => value.trim())
        .filter(Boolean)
        .filter(value => {
            const key = value.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

module.exports = {
    parseDocIdsInput
};
