import fs from 'node:fs';
import path from 'node:path';

export interface RunLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  close: () => void;
}

export function openLogger(outputDir: string, name: string): RunLogger {
  fs.mkdirSync(outputDir, { recursive: true });
  const stream = fs.createWriteStream(path.join(outputDir, 'run.log'), { flags: 'a' });
  const write = (level: string, msg: string) => {
    const line = `[${new Date().toISOString()}] [${name}] [${level}] ${msg}\n`;
    stream.write(line);
    if (level === 'ERROR') {
      console.error(line.trimEnd());
    } else {
      console.log(line.trimEnd());
    }
  };
  return {
    info: (m) => write('INFO', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m),
    close: () => stream.end(),
  };
}
