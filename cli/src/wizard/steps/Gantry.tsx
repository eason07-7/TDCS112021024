import React, { useState } from 'react';
import { Box, Text, useInput, Key } from 'ink';
import { WizardState, WizardAnswers } from '../state';
// M3 完成：從 gantries_v4_1.json 載入 339 個門架（v4.1 PDF §3）
import rawGantries from '../../../data/gantries_v4_1.json';

interface Props {
  state: WizardState;
  onNext: (patch?: Partial<WizardAnswers>) => void;
  onPrev: () => void;
  onQuit: () => void;
}

interface GantryEntry {
  id: string;
  route: string;
  section: string;
}

// Map JSON schema (gantry_id, route, section, ...) → GantryEntry (id, route, section)
const GANTRIES: GantryEntry[] = (rawGantries as Array<{
  gantry_id: string; route: string; section: string;
}>).map(g => ({ id: g.gantry_id, route: g.route, section: g.section }));

const PAGE_SIZE = 8;

export default function GantryStep({ state, onNext, onPrev, onQuit }: Props) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(state.answers.gantries ?? [])
  );
  const [offset, setOffset] = useState(0);

  const visibleItems = GANTRIES.slice(offset, offset + PAGE_SIZE);

  useInput((input: string, key: Key) => {
    if (input === 'q') { onQuit(); return; }
    if (key.escape)    { onPrev(); return; }

    if (key.upArrow) {
      if (cursor > 0) {
        setCursor(c => c - 1);
        if (cursor - 1 < offset) setOffset(o => o - 1);
      }
      return;
    }
    if (key.downArrow) {
      if (cursor < GANTRIES.length - 1) {
        setCursor(c => c + 1);
        if (cursor + 1 >= offset + PAGE_SIZE) setOffset(o => o + 1);
      }
      return;
    }

    if (input === ' ') {
      const id = GANTRIES[cursor].id;
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }

    if (input === 'a') {
      if (selected.size === GANTRIES.length) {
        setSelected(new Set());
      } else {
        setSelected(new Set(GANTRIES.map(g => g.id)));
      }
      return;
    }

    if (key.return) {
      onNext({ gantries: [...selected] });
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>選擇路段 </Text>
        <Text dimColor>（已選 {selected.size} / {GANTRIES.length}）</Text>
        <Text dimColor>  [space 切換 · a 全選/全消]</Text>
      </Box>
      <Text dimColor>（全台 {GANTRIES.length} 個門架，TDCS 手冊 v4.1）</Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {visibleItems.map((g, i) => {
          const absIdx = offset + i;
          const isCursor = absIdx === cursor;
          const isSel = selected.has(g.id);
          return (
            <Box key={g.id}>
              <Text color={isCursor ? 'cyan' : undefined}>
                {isCursor ? '▶' : ' '}
              </Text>
              <Text color={isSel ? 'green' : 'white'}>
                {isSel ? ' [✔] ' : ' [ ] '}
              </Text>
              <Text bold={isCursor} color={isSel ? 'green' : undefined}>
                {g.id}
              </Text>
              <Text dimColor>{'  '}{g.route} {g.section}</Text>
            </Box>
          );
        })}
        {GANTRIES.length > PAGE_SIZE + offset && (
          <Text dimColor>…還有 {GANTRIES.length - PAGE_SIZE - offset} 個</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>選完後按 </Text>
        <Text bold color="yellow">Enter</Text>
        <Text dimColor> 確認（可空選、代表全路段）</Text>
      </Box>
    </Box>
  );
}
