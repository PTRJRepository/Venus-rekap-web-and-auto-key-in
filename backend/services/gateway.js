const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config();

const API_TOKEN = process.env.API_TOKEN_QUERY;
const SERVER_PROFILE = process.env.SERVER_PROFILE || 'SERVER_PROFILE_3';
const GATEWAY_TIMEOUT = Number(process.env.GATEWAY_TIMEOUT || 10000);
const GATEWAY_PREFLIGHT_TIMEOUT = Number(process.env.GATEWAY_PREFLIGHT_TIMEOUT || 1500);

const normalizeGateway = (url) => {
  const normalized = String(url || '').replace(/\/+$/, '');
  const hasV1QueryPath = /\/v1\/query$/i.test(normalized);
  const hasQueryPath = /\/query$/i.test(normalized);
  return {
    baseURL: hasV1QueryPath
      ? normalized.replace(/\/v1\/query$/i, '')
      : hasQueryPath
        ? normalized.replace(/\/query$/i, '')
        : normalized,
    queryPath: hasV1QueryPath ? '/v1/query' : hasQueryPath ? '/query' : '/v1/query'
  };
};

const primaryGateway = normalizeGateway(process.env.GATEWAY_URL || 'http://localhost:8001');
const fallbackGatewayUrl = process.env.LOCAL_GATEWAY_URL || process.env.GATEWAY_FALLBACK_URL || 'http://localhost:8001';
const fallbackGateway = normalizeGateway(fallbackGatewayUrl);
const gateways = [primaryGateway];
let activeGatewaysPromise;

if (`${fallbackGateway.baseURL}${fallbackGateway.queryPath}` !== `${primaryGateway.baseURL}${primaryGateway.queryPath}`) {
  gateways.push(fallbackGateway);
}

const shouldTryFallback = (error) => {
  if (!error.response) return true;
  return error.response.status >= 500;
};

const isSameGateway = (a, b) => `${a.baseURL}${a.queryPath}` === `${b.baseURL}${b.queryPath}`;

const checkGatewayReachable = async (gateway) => {
  try {
    await axios.get(gateway.baseURL, {
      timeout: GATEWAY_PREFLIGHT_TIMEOUT,
      validateStatus: () => true
    });
    return true;
  } catch (error) {
    console.warn(`[Gateway] Preflight failed for ${gateway.baseURL}: ${error.message}`);
    return false;
  }
};

const getActiveGateways = async () => {
  if (!activeGatewaysPromise) {
    activeGatewaysPromise = (async () => {
      if (gateways.length === 1 || isSameGateway(primaryGateway, fallbackGateway)) {
        console.log(`[Gateway] Active URL: ${primaryGateway.baseURL}${primaryGateway.queryPath}`);
        return [primaryGateway];
      }

      const primaryAvailable = await checkGatewayReachable(primaryGateway);
      if (primaryAvailable) {
        console.log(`[Gateway] Active URL: ${primaryGateway.baseURL}${primaryGateway.queryPath}`);
        return [primaryGateway, fallbackGateway];
      }

      console.warn(`[Gateway] Primary unavailable at startup. Using local gateway: ${fallbackGateway.baseURL}${fallbackGateway.queryPath}`);
      return [fallbackGateway];
    })();
  }

  return activeGatewaysPromise;
};

console.log(`[Gateway] URL: ${primaryGateway.baseURL}${primaryGateway.queryPath}, Profile: ${SERVER_PROFILE}`);
if (gateways.length > 1) {
  console.log(`[Gateway] Fallback URL: ${fallbackGateway.baseURL}${fallbackGateway.queryPath}, timeout=${GATEWAY_TIMEOUT}ms, preflight=${GATEWAY_PREFLIGHT_TIMEOUT}ms`);
}

getActiveGateways().catch(error => {
  console.warn(`[Gateway] Preflight initialization failed: ${error.message}`);
});

const executeQuery = async (sql) => {
  let lastError;
  const activeGateways = await getActiveGateways();

  for (let i = 0; i < activeGateways.length; i += 1) {
    const gateway = activeGateways[i];
    const label = isSameGateway(gateway, primaryGateway) ? 'primary' : 'fallback';

    try {
      console.log(`Executing SQL on ${SERVER_PROFILE} via ${label} gateway ${gateway.baseURL}${gateway.queryPath}: ${sql.substring(0, 50)}...`);
      const response = await axios.post(`${gateway.baseURL}${gateway.queryPath}`, {
        sql,
        server_profile: SERVER_PROFILE
      }, {
        headers: {
          'x-api-key': API_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: GATEWAY_TIMEOUT
      });

    if (response.data.success) {
      return response.data.data.recordset;
    }

      throw new Error(response.data.error || 'Unknown gateway error');
    } catch (error) {
      lastError = error;
      console.error(`Gateway Query Error (${label}):`, error.message);
      if (error.response) {
        console.error('Gateway Response:', error.response.data);
      }

      if (i < activeGateways.length - 1 && shouldTryFallback(error)) {
        console.warn(`[Gateway] ${gateway.baseURL} unavailable. Trying local fallback...`);
        continue;
      }

      break;
    }
  }

  throw lastError;
};

module.exports = { executeQuery };
