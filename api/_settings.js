const { Redis } = require('@upstash/redis');

let redisClient = null;

function redisConfig() {
  return {
    url: String(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim(),
    token: String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim(),
  };
}

function settingsStoreConfigured() {
  const { url, token } = redisConfig();
  return Boolean(url && token);
}

function redis() {
  if (redisClient) return redisClient;
  const { url, token } = redisConfig();
  if (!url || !token) {
    const e = new Error('settings_store_not_configured');
    e.status = 503;
    throw e;
  }
  redisClient = new Redis({ url, token, enableTelemetry: false });
  return redisClient;
}

function repoSettingsKey(repo) {
  return `artifact-lens:repo-settings:v1:${String(repo || '').toLowerCase()}`;
}

function enabledValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

async function getRepoSettings(repo) {
  if (!settingsStoreConfigured()) {
    return { configured: false, public_artifacts: false };
  }

  const value = await redis().hget(repoSettingsKey(repo), 'public_artifacts');
  return {
    configured: true,
    public_artifacts: enabledValue(value),
  };
}

async function isRepoPublicArtifacts(repo) {
  try {
    const settings = await getRepoSettings(repo);
    return settings.configured && settings.public_artifacts;
  } catch (e) {
    console.error('Repository settings lookup failed', { repo, error: e.message });
    return false;
  }
}

async function setRepoPublicArtifacts(repo, enabled, updatedBy = '') {
  const client = redis();
  await client.hset(repoSettingsKey(repo), {
    public_artifacts: enabled ? '1' : '0',
    updated_at: new Date().toISOString(),
    updated_by: String(updatedBy || ''),
  });
  return {
    configured: true,
    public_artifacts: Boolean(enabled),
  };
}

module.exports = {
  settingsStoreConfigured,
  getRepoSettings,
  isRepoPublicArtifacts,
  setRepoPublicArtifacts,
};
