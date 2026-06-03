/**
 * tdcs-dl config — endpoint 抽象（M6）
 *
 * 三層 priority：env > file > default
 *   1. env  : process.env.TDCS_DL_ENDPOINT
 *   2. file : ~/.tdcs-dl/config.json (TDCS_DL_CONFIG_DIR 可覆蓋目錄、給 CI / test 用)
 *   3. default : hardcoded placeholder（PLAN_E7 部署 AWS 後改正）
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export const DEFAULT_ENDPOINT = 'https://placeholder.invalid/';
export const CONFIG_FILE_NAME = 'config.json';
export const CONFIG_DIR_NAME = '.tdcs-dl';
export const ENV_ENDPOINT = 'TDCS_DL_ENDPOINT';
export const ENV_CONFIG_DIR = 'TDCS_DL_CONFIG_DIR';

export type EndpointSource = 'env' | 'file' | 'default';

export interface ConfigFile {
  endpoint?: string;
  profile?: string;
}

export interface ResolvedEndpoint {
  value: string;
  source: EndpointSource;
}

/** ~/.tdcs-dl 目錄；TDCS_DL_CONFIG_DIR 覆蓋（CI / test 隔離用）。 */
export function getConfigDir(): string {
  const override = process.env[ENV_CONFIG_DIR];
  if (override && override.length > 0) return override;
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/** 讀 config.json；不存在或 parse 失敗 → null（呼叫者按 default 處理）。 */
export function loadConfigFile(): ConfigFile | null {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return null;
    return obj as ConfigFile;
  } catch {
    return null;
  }
}

/** 原子寫 config.json（temp + rename、避免半寫狀態）。 */
export function saveConfigFile(cfg: ConfigFile): void {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = getConfigPath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, target);
}

/** 解析 endpoint：env > file > default。 */
export function resolveEndpoint(): ResolvedEndpoint {
  const fromEnv = process.env[ENV_ENDPOINT];
  if (fromEnv && fromEnv.length > 0) {
    return { value: fromEnv, source: 'env' };
  }
  const file = loadConfigFile();
  if (file?.endpoint && file.endpoint.length > 0) {
    return { value: file.endpoint, source: 'file' };
  }
  return { value: DEFAULT_ENDPOINT, source: 'default' };
}

/** URL 形狀驗證：限 http(s)、可解析。 */
export function validateEndpointUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`不是合法的 URL：${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`endpoint 必須是 http(s)://，收到 ${parsed.protocol}`);
  }
}

/** 寫 endpoint 到 file（merge 既有 file 內容）。 */
export function setEndpoint(url: string): void {
  validateEndpointUrl(url);
  const current = loadConfigFile() ?? {};
  saveConfigFile({ ...current, endpoint: url });
}

/** 刪 config.json；不存在當作已 reset。 */
export function resetConfig(): boolean {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

/** show 用：merged view（env override + file + default fallback）+ 每欄來源。 */
export interface ShowView {
  endpoint: ResolvedEndpoint;
  profile: { value: string | null; source: 'file' | 'none' };
  configPath: string;
  configFileExists: boolean;
}

export function getShowView(): ShowView {
  const file = loadConfigFile();
  const profileVal = file?.profile;
  return {
    endpoint: resolveEndpoint(),
    profile: profileVal
      ? { value: profileVal, source: 'file' }
      : { value: null, source: 'none' },
    configPath: getConfigPath(),
    configFileExists: fs.existsSync(getConfigPath()),
  };
}
