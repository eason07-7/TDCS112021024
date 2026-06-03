#!/usr/bin/env node
import { Command } from 'commander';
import React from 'react';
import { render } from 'ink';
import App from './wizard/App';
import { registerConfigCommands } from './commands/config';

const program = new Command();

program
  .name('tdcs-dl')
  .description('TDCS 自動下載 + 清洗 CLI 工具 — 幫 TDCS 研究者跳過前置苦工')
  .version('0.1.0')
  .action(() => {
    render(React.createElement(App));
  });

registerConfigCommands(program);

program.parse(process.argv);
