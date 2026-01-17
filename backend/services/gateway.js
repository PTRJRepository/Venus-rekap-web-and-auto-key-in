const axios = require('axios');
require('dotenv').config();

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
const API_TOKEN = process.env.API_TOKEN_QUERY;
const SERVER_PROFILE = process.env.SERVER_PROFILE || 'SERVER_PROFILE_3'; // User confirmed DB is here

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