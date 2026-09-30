import { inspectSample } from './inspect.ts';
import { evaluateGate } from './gate.ts';

const [command, file, ...options] = process.argv.slice(2);
try {
  if (!file || !['inspect', 'gate'].includes(command) ||
      (command === 'inspect' && options.length !== 0 && !(options.length === 2 && options[0] === '--media' && options[1])) ||
      (command === 'gate' && options.length !== 0)) {
    console.error('Usage: npm run preflight -- inspect <decrypted-sample.json> [--media <media.json>]\n       npm run preflight -- gate <acceptance.json>');
    process.exitCode = 1;
  } else {
    const result = command === 'inspect' ? await inspectSample(file, options[1]) : await evaluateGate(file);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = ('structurallyComplete' in result ? result.structurallyComplete : result.status === 'READY_FOR_ADMIN_REVIEW') ? 0 : 2;
  }
} catch {
  // JSON.parse / filesystem exceptions can include original messages or sensitive paths.
  console.error('INPUT_ERROR: Check JSON format, file accessibility and the documented input contract. Raw input is not logged.');
  process.exitCode = 1;
}
