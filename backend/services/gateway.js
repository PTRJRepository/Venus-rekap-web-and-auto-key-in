const axios = require('axios');
require('dotenv').config();

// GATEWAY_URL should be like: http://223.25.98.220:3001/query
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001/query';
const API_TOKEN = process.env.API_TOKEN_QUERY;
const SERVER_PROFILE = process.env.SERVER_PROFILE || 'SERVER_PROFILE_3';
console.log(`[Gateway] URL: ${GATEWAY_URL}, Profile: ${SERVER_PROFILE}`);

const gatewayClient = axios.create({
  baseURL: GATEWAY_URL,
  headers: {
    'x-api-key': API_TOKEN,
    'Content-Type': 'application/json'
  }
});

const executeQuery = async (sql) => {
  try {
    console.log(`Executing SQL on ${SERVER_PROFILE}: ${sql.substring(0, 50)}...`);
    // Endpoint is /v1/query relative to baseURL (/query)
    // Full path: /query/v1/query
    const response = await gatewayClient.post('/v1/query', {
      sql,
      server_profile: SERVER_PROFILE
    });
    if (response.data.success) {
      return response.data.data.recordset;
    } else {
      throw new Error(response.data.error || 'Unknown gateway error');
    }
  } catch (error) {
    console.error('Gateway Query Error:', error.message);
    if (error.response) {
      console.error('Gateway Response:', error.response.data);
    }
    throw error;
  }
};

module.exports = { executeQuery };