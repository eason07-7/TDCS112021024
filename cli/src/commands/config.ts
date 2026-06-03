/**
 * tdcs-dl config — commander subcommand register（M7）
 *
 *   set-endpoint <url>  寫 ~/.tdcs-dl/config.json
 *   get-endpoint        印當前 endpoint + 來源 (env / file / default)
 *   show                印所有 config + 來源
 *   reset               刪 ~/.tdcs-dl/config.json
 */
import { Command } from 'commander';
import {
  resolveEndpoint,
  setEndpoint,
  resetConfig,
  getShowView,
  getConfigPath,
  ENV_ENDPOINT,
} from '../lib/config';

export function registerConfigCommands(program: Command): void {
  const configCmd = program
    .command('config')
    .description('管理 tdcs-dl 組態（endpoint / profile）');

  configCmd
    .command('set-endpoint <url>')
    .description('設定 AWS backend endpoint URL（寫入 ~/.tdcs-dl/config.json）')
    .action((url: string) => {
      try {
        setEndpoint(url);
        console.log(`✓ endpoint 已寫入：${url}`);
        console.log(`  位置：${getConfigPath()}`);
        if (process.env[ENV_ENDPOINT]) {
          console.log(
            `  注意：環境變數 ${ENV_ENDPOINT} 已設、會優先於 file（env > file > default）`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`✗ set-endpoint 失敗：${msg}`);
        process.exitCode = 1;
      }
    });

  configCmd
    .command('get-endpoint')
    .description('印當前生效的 endpoint（含來源：env / file / default）')
    .action(() => {
      const r = resolveEndpoint();
      console.log(`endpoint = ${r.value}`);
      console.log(`source   = ${r.source}`);
    });

  configCmd
    .command('show')
    .description('印所有 config（含每欄來源）')
    .action(() => {
      const v = getShowView();
      console.log(`config file : ${v.configPath}${v.configFileExists ? '' : ' (不存在)'}`);
      console.log(`endpoint    = ${v.endpoint.value}  [${v.endpoint.source}]`);
      const pv = v.profile.value ?? '(unset)';
      console.log(`profile     = ${pv}  [${v.profile.source}]`);
    });

  configCmd
    .command('reset')
    .description('刪除 ~/.tdcs-dl/config.json，恢復 hardcoded default')
    .action(() => {
      const removed = resetConfig();
      if (removed) {
        console.log(`✓ 已刪除 ${getConfigPath()}`);
      } else {
        console.log(`(no-op) ${getConfigPath()} 本來就不存在`);
      }
    });
}
