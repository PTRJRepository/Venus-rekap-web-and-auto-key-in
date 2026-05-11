const axios = require('axios');
require('dotenv').config();

const rawGatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8001';
const normalizedGatewayUrl = rawGatewayUrl.replace(/\/+$/, '');
const hasQueryPath = /\/query$/i.test(normalizedGatewayUrl);
const GATEWAY_URL = hasQueryPath ? normalizedGatewayUrl.replace(/\/query$/i, '') : normalizedGatewayUrl;
const GATEWAY_QUERY_PATH = hasQueryPath ? '/query' : '/v1/query';
const API_TOKEN = process.env.API_TOKEN_QUERY;
const SERVER_PROFILE = process.env.SERVER_PROFILE || 'SERVER_PROFILE_3';
console.log(`[Gateway] URL: ${GATEWAY_URL}${GATEWAY_QUERY_PATH}, Profile: ${SERVER_PROFILE}`);

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
    const response = await gatewayClient.post(GATEWAY_QUERY_PATH, {
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