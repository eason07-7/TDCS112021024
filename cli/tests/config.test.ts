/**
 * Unit tests for cli/src/lib/config.ts
 * 三層 priority + URL 驗證 + round-trip + reset
 *
 * 用 TDCS_DL_CONFIG_DIR 把 config dir 重定向到 tmpdir、不污染 user 主目錄。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DEFAULT_ENDPOINT,
  ENV_ENDPOINT,
  ENV_CONFIG_DIR,
  CONFIG_FILE_NAME,
  resolveEndpoint,
  setEndpoint,
  resetConfig,
  loadConfigFile,
  saveConfigFile,
  validateEndpointUrl,
  getConfigPath,
  getShowView,
} from '../src/lib/config';

let tmpDir: string;
const originalEnv = { ...process.env };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdcs-dl-config-test-'));
  process.env[ENV_CONFIG_DIR] = tmpDir;
  delete process.env[ENV_ENDPOINT];
});

afterEach(() => {
  process.env = { ...originalEnv };
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('three-layer priority: env > file > default', () => {
  test('no env, no file → default', () => {
    const r = resolveEndpoint();
    expect(r.value).toBe(DEFAULT_ENDPOINT);
    expect(r.source).toBe('default');
  });

  test('file only → file', () => {
    saveConfigFile({ endpoint: 'https://from-file.example/' });
    const r = resolveEndpoint();
    expect(r.value).toBe('https://from-file.example/');
    expect(r.source).toBe('file');
  });

  test('env only → env', () => {
    process.env[ENV_ENDPOINT] = 'https://from-env.example/';
    const r = resolveEndpoint();
    expect(r.value).toBe('https://from-env.example/');
    expect(r.source).toBe('env');
  });

  test('env beats file', () => {
    saveConfigFile({ endpoint: 'https://from-file.example/' });
    process.env[ENV_ENDPOINT] = 'https://from-env.example/';
    const r = resolveEndpoint();
    expect(r.value).toBe('https://from-env.example/');
    expect(r.source).toBe('env');
  });

  test('empty env var falls through to file', () => {
    process.env[ENV_ENDPOINT] = '';
    saveConfigFile({ endpoint: 'https://from-file.example/' });
    const r = resolveEndpoint();
    expect(r.source).toBe('file');
  });
});

describe('setEndpoint round-trip', () => {
  test('set → get reads same value via file', () => {
    setEndpoint('https://api.example.com/');
    const r = resolveEndpoint();
    expect(r.value).toBe('https://api.example.com/');
    expect(r.source).toBe('file');
  });

  test('set merges with existing profile field (no clobber)', () => {
    saveConfigFile({ profile: 'dev' });
    setEndpoint('https://api.example.com/');
    const f = loadConfigFile();
    expect(f?.endpoint).toBe('https://api.example.com/');
    expect(f?.profile).toBe('dev');
  });

  test('config.json is at TDCS_DL_CONFIG_DIR + config.json', () => {
    setEndpoint('https://x.example/');
    expect(getConfigPath()).toBe(path.join(tmpDir, CONFIG_FILE_NAME));
    expect(fs.existsSync(getConfigPath())).toBe(true);
  });
});

describe('validateEndpointUrl', () => {
  test('accepts https', () => {
    expect(() => validateEndpointUrl('https://api.example.com/')).not.toThrow();
  });
  test('accepts http', () => {
    expect(() => validateEndpointUrl('http://localhost:8080/')).not.toThrow();
  });
  test('rejects garbage', () => {
    expect(() => validateEndpointUrl('not-a-url')).toThrow(/不是合法的 URL/);
  });
  test('rejects non-http(s) protocol', () => {
    expect(() => validateEndpointUrl('ftp://example.com/')).toThrow(/http\(s\)/);
  });
  test('setEndpoint propagates validation error', () => {
    expect(() => setEndpoint('javascript:alert(1)')).toThrow();
    expect(fs.existsSync(getConfigPath())).toBe(false);
  });
});

describe('resetConfig', () => {
  test('removes existing file', () => {
    setEndpoint('https://x.example/');
    expect(fs.existsSync(getConfigPath())).toBe(true);
    expect(resetConfig()).toBe(true);
    expect(fs.existsSync(getConfigPath())).toBe(false);
    expect(resolveEndpoint().source).toBe('default');
  });

  test('no-op when file absent', () => {
    expect(resetConfig()).toBe(false);
  });
});

describe('loadConfigFile resilience', () => {
  test('returns null for malformed JSON', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, CONFIG_FILE_NAME), '{ this is not json');
    expect(loadConfigFile()).toBeNull();
    expect(resolveEndpoint().source).toBe('default');
  });
});

describe('getShowView', () => {
  test('reports endpoint + profile + file existence', () => {
    saveConfigFile({ endpoint: 'https://a.example/', profile: 'dev' });
    const v = getShowView();
    expect(v.endpoint.value).toBe('https://a.example/');
    expect(v.endpoint.source).toBe('file');
    expect(v.profile.value).toBe('dev');
    expect(v.profile.source).toBe('file');
    expect(v.configFileExists).toBe(true);
  });

  test('profile=none when no file', () => {
    const v = getShowView();
    expect(v.profile.value).toBeNull();
    expect(v.profile.source).toBe('none');
    expect(v.configFileExists).toBe(false);
  });
});
