/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Play, SkipForward, RotateCcw, Database } from 'lucide-react';

type Pins = { A: number; B: number; C: number; D: number };
type PinKey = keyof Pins;

interface Token {
  type: 'not' | 'eq' | 'and' | 'or' | 'xor' | 'eeprom' | 'term' | 'unot';
  val?: string | number | Token;
}

const DEFAULT_CODE =
  'on(A); on(B); if(A & B) sbi(C, A ~ B); sbi(D, A | !C); if(A | B) off(A); sbi(15, A & B);';

export default function App() {
  const pinsRef = useRef<Pins>({ A: 0, B: 0, C: 0, D: 0 });
  const eepromRef = useRef<number[]>(new Array(256).fill(0));
  const pendingAfterRef = useRef<{ id: ReturnType<typeof setTimeout>; cmdStr: string } | null>(null);
  const stepQueueRef = useRef<string[]>([]);
  const logRef = useRef<HTMLPreElement>(null);

  const [pins, setPins] = useState<Pins>({ A: 0, B: 0, C: 0, D: 0 });
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [autoClear, setAutoClear] = useState<boolean>(true);
  const [logText, setLogText] = useState<string>(() => {
    const t = new Date().toLocaleTimeString();
    return `[${t}] Interpreter ready. Supported commands: on, off, sbi, if(... ) ... > ..., after(time,"..."), print. Use : for comments.\n`;
  });

  const uiLog = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLogText((prev) => prev + `[${t}] ${msg}\n`);
  };

  const clearLog = () => {
    setLogText('');
  };

  const syncPinsUI = () => {
    setPins({ ...pinsRef.current });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      document.documentElement.style.setProperty('--mx', `${e.clientX}px`);
      document.documentElement.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (pendingAfterRef.current) {
        clearTimeout(pendingAfterRef.current.id);
      }
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  // Parsing utilities (exact original logic)
  const removeComments = (s: string) => s.replace(/:.*$/gm, '');

  const splitTopLevelSemicolons = (s: string) => {
    const out: string[] = [];
    let cur = '';
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') {
        inStr = !inStr;
        cur += ch;
        continue;
      }
      if (!inStr && ch === ';') {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.filter((x) => x.length > 0);
  };

  const parseArgsParen = (s: string) => {
    let inner = s.trim();
    if (inner.startsWith('(') && inner.endsWith(')')) inner = inner.slice(1, -1);
    const args: string[] = [];
    let cur = '';
    let inStr = false;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '"') {
        inStr = !inStr;
        cur += ch;
        continue;
      }
      if (!inStr && ch === ',') {
        args.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  };

  const stripQuotes = (s: string) => {
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    return s;
  };

  const findTopLevelElse = (s: string) => {
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') inStr = !inStr;
      if (!inStr && ch === '>') return i;
    }
    return -1;
  };

  // Condition evaluation according to spec
  const tokenizeCond = (s: string): Token[] => {
    s = s.replace(/\s+/g, '');
    const toks: Token[] = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '!') {
        toks.push({ type: 'not' });
        i++;
        continue;
      }
      if (ch === '=') {
        toks.push({ type: 'eq' });
        i++;
        continue;
      }
      if (ch === '&') {
        toks.push({ type: 'and' });
        i++;
        continue;
      }
      if (ch === '|') {
        toks.push({ type: 'or' });
        i++;
        continue;
      }
      if (ch === '~') {
        toks.push({ type: 'xor' });
        i++;
        continue;
      }
      if (ch === '#') {
        let j = i + 1;
        let num = '';
        while (j < s.length && /[0-9]/.test(s[j])) {
          num += s[j];
          j++;
        }
        if (num === '') {
          i++;
          continue;
        }
        toks.push({ type: 'eeprom', val: parseInt(num, 10) });
        i = j;
        continue;
      }
      if (/[A-D0-1]/.test(ch)) {
        toks.push({ type: 'term', val: ch });
        i++;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let j = i;
        let num = '';
        while (j < s.length && /[0-9]/.test(s[j])) {
          num += s[j];
          j++;
        }
        toks.push({ type: 'term', val: num });
        i = j;
        continue;
      }
      i++;
    }
    const out: Token[] = [];
    for (let k = 0; k < toks.length; k++) {
      if (toks[k].type === 'not' && k + 1 < toks.length) {
        const next = toks[k + 1];
        out.push({ type: 'unot', val: next });
        k++;
      } else {
        out.push(toks[k]);
      }
    }
    return out;
  };

  const evalCond = (s: string): number => {
    const toks = tokenizeCond(s);
    if (toks.length === 0) return 0;

    const valOf = (tok: Token): number => {
      if (tok.type === 'unot') {
        return valOf(tok.val as Token) ? 0 : 1;
      }
      if (tok.type === 'term') {
        const v = String(tok.val);
        if (v === '0') return 0;
        if (v === '1') return 1;
        if (/^[A-D]$/.test(v)) return pinsRef.current[v as PinKey] ? 1 : 0;
        return parseInt(v, 10) ? 1 : 0;
      }
      if (tok.type === 'eeprom') {
        const idx = Number(tok.val);
        if (isNaN(idx) || idx < 1 || idx > 256) return 0;
        return eepromRef.current[idx - 1] ? 1 : 0;
      }
      return 0;
    };

    const ops: Array<Token['type']> = ['eq', 'and', 'or', 'xor'];
    const cur = toks.slice();
    for (const op of ops) {
      let i = 0;
      while (i < cur.length) {
        if (cur[i].type === op) {
          const left = cur[i - 1];
          const right = cur[i + 1];
          const lv = valOf(left);
          const rv = valOf(right);
          let res = 0;
          if (op === 'eq') res = lv === rv ? 1 : 0;
          else if (op === 'and') res = lv & rv ? 1 : 0;
          else if (op === 'or') res = lv | rv ? 1 : 0;
          else if (op === 'xor') res = lv ^ rv ? 1 : 0;
          cur.splice(i - 1, 3, { type: 'term', val: String(res) });
          i = Math.max(0, i - 1);
        } else {
          i++;
        }
      }
    }
    if (cur.length === 0) return 0;
    const finalTok = cur[0];
    return valOf(finalTok) ? 1 : 0;
  };

  // Execute commands (exact original logic)
  const executeCommand = (cmd: string) => {
    if (!cmd) return;
    const raw = cmd.trim();
    if (!raw) return;

    const mIf = raw.match(/^if\(([^)]*)\)\s*([\s\S]*)$/i);
    if (mIf) {
      const condText = mIf[1].trim();
      const rest = mIf[2].trim();
      const idx = findTopLevelElse(rest);
      let thenPart = rest;
      let elsePart: string | null = null;
      if (idx >= 0) {
        thenPart = rest.slice(0, idx).trim();
        elsePart = rest.slice(idx + 1).trim();
      }
      let condVal = 0;
      try {
        condVal = evalCond(condText);
      } catch {
        uiLog('if() eval error: ' + condText);
        return;
      }
      const branch = condVal ? thenPart : elsePart !== null ? elsePart : '';
      const parts = splitTopLevelSemicolons(branch + ';');
      for (const p of parts) {
        if (p.trim()) executeCommand(p.trim());
      }
      return;
    }

    const mAfter = raw.match(/^after\(([^,]+)\s*,\s*("[\s\S]*")\s*\)$/i);
    if (mAfter) {
      const tsec = parseFloat(mAfter[1]);
      const cmdStr = stripQuotes(mAfter[2]);
      if (pendingAfterRef.current) {
        clearTimeout(pendingAfterRef.current.id);
        uiLog('Existing after canceled');
      }
      const id = setTimeout(() => {
        pendingAfterRef.current = null;
        uiLog('after: executing -> ' + cmdStr);
        runScript(cmdStr);
      }, Math.max(0, Math.floor(tsec * 1000)));
      pendingAfterRef.current = { id, cmdStr };
      uiLog(`after(${tsec}) scheduled`);
      return;
    }

    const mOn = raw.match(/^on\(([^)]*)\)$/i);
    if (mOn) {
      const args = parseArgsParen('(' + mOn[1] + ')');
      for (const a of args) {
        const name = a.trim().toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(name)) {
          pinsRef.current[name as PinKey] = 1;
          uiLog(`on(${name}) -> 1`);
        }
      }
      syncPinsUI();
      return;
    }

    const mOff = raw.match(/^off\(([^)]*)\)$/i);
    if (mOff) {
      const args = parseArgsParen('(' + mOff[1] + ')');
      for (const a of args) {
        const name = a.trim().toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(name)) {
          pinsRef.current[name as PinKey] = 0;
          uiLog(`off(${name}) -> 0`);
        }
      }
      syncPinsUI();
      return;
    }

    const mPrint = raw.match(/^print\((([\s\S]*))\)$/i);
    if (mPrint) {
      const rawArgs = mPrint[1];
      const args = parseArgsParen('(' + rawArgs + ')');
      let out = '';
      for (const a of args) {
        const t = a.trim();
        if (t.startsWith('"')) {
          out += stripQuotes(t);
        } else {
          try {
            out += String(evalCond(t));
          } catch {
            out += '?';
          }
        }
      }
      uiLog('PRINT: ' + out);
      return;
    }

    const mSbi = raw.match(/^sbi\(([^,]+)\s*,\s*([\s\S]+)\)$/i);
    if (mSbi) {
      const target = mSbi[1].trim();
      const cond = mSbi[2].trim();
      let val = 0;
      try {
        val = evalCond(cond);
      } catch {
        uiLog('sbi cond error: ' + cond);
        return;
      }
      if (/^[A-D]$/i.test(target)) {
        const p = target.toUpperCase() as PinKey;
        pinsRef.current[p] = val;
        syncPinsUI();
        uiLog(`sbi(${p}, ${cond}) -> ${val}`);
      } else {
        const idx = parseInt(target, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= 256) {
          eepromRef.current[idx - 1] = val;
          uiLog(`sbi(${idx}, ${cond}) -> #${idx}=${val}`);
        } else {
          uiLog('sbi: invalid target ' + target);
        }
      }
      return;
    }

    uiLog('Unknown command: ' + raw);
  };

  const runScript = (src: string) => {
    const clean = removeComments(src);
    const stmts = splitTopLevelSemicolons(clean);
    for (const s of stmts) {
      if (s.trim()) executeCommand(s.trim());
    }
  };

  // Handlers
  const handleRun = () => {
    if (autoClear) clearLog();
    for (let i = 0; i < 256; i++) eepromRef.current[i] = 0;
    for (const k of ['A', 'B', 'C', 'D'] as PinKey[]) pinsRef.current[k] = 0;
    syncPinsUI();
    if (pendingAfterRef.current) {
      clearTimeout(pendingAfterRef.current.id);
      pendingAfterRef.current = null;
      uiLog('Pending after cleared');
    }
    uiLog('--- Program start ---');
    try {
      runScript(code);
    } catch (e: unknown) {
      uiLog('Runtime error: ' + (e instanceof Error ? e.message : String(e)));
    }
    uiLog('--- Program end ---');
  };

  const handleStep = () => {
    if (stepQueueRef.current.length === 0) {
      const clean = removeComments(code);
      stepQueueRef.current = splitTopLevelSemicolons(clean).filter((s) => s.trim());
    }
    const stmt = stepQueueRef.current.shift();
    if (stmt) {
      uiLog('STEP -> ' + stmt);
      try {
        executeCommand(stmt);
      } catch (e: unknown) {
        uiLog('Step error: ' + (e instanceof Error ? e.message : String(e)));
      }
    } else {
      uiLog('No statements left');
    }
    syncPinsUI();
  };

  const handleReset = () => {
    for (const p of ['A', 'B', 'C', 'D'] as PinKey[]) pinsRef.current[p] = 0;
    syncPinsUI();
    uiLog('Pins reset');
  };

  const handleShowEEPROM = () => {
    let out = 'EEPROM state:\n';
    for (let i = 0; i < 256; i++) out += `#${i + 1}: ${eepromRef.current[i]}\n`;
    uiLog(out);
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden bg-[#000000] text-[#f4f7ee] px-3 py-6 sm:py-10 flex items-start justify-center">
      {/* Background Layer 1: Full black canvas + Pistachio green grid */}
      <div className="fixed inset-0 pointer-events-none pistachio-grid" aria-hidden="true" />

      {/* Background Layer 2: Big ambient pistachio green glows around the black canvas */}
      <div
        className="fixed -top-48 -left-40 w-[580px] h-[580px] rounded-full bg-[#BEF264]/12 blur-[140px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="fixed -bottom-52 -right-36 w-[620px] h-[620px] rounded-full bg-[#BEF264]/10 blur-[160px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="fixed top-1/3 right-1/6 w-[380px] h-[380px] rounded-full bg-[#BEF264]/6 blur-[140px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Background Layer 3: Interactive mouse-following grid highlight & soft pistachio glow */}
      <div
        className="fixed inset-0 pointer-events-none pistachio-grid-cursor"
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 pointer-events-none pistachio-mouse-glow"
        aria-hidden="true"
      />

      {/* Original vertical emulator card: translucent glass with outward pistachio glow from the card itself */}
      <main className="relative z-10 w-full max-w-[960px] bg-black/30 backdrop-blur-md border border-[#BEF264]/35 rounded-2xl p-4 sm:p-6 shadow-[0_0_55px_-6px_rgba(190,242,100,0.38),0_0_18px_-4px_rgba(190,242,100,0.22)]">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-2">
          Logic Sandbox (pins A–D)
        </h2>

        {/* Centered MCU Package with A–D Pins (exact original style + back glow) */}
        <div className="flex justify-center my-5 relative">
          <div className="relative">
            <div
              className="absolute -inset-4 rounded-2xl bg-[#BEF264]/35 blur-2xl pointer-events-none"
              aria-hidden="true"
            />
            <div className="w-[120px] h-[120px] bg-[#222222] rounded-[8px] relative shadow-[0_0_28px_rgba(190,242,100,0.35)]">
            {/* Pin A (Top) */}
            <div
              className={`min-w-[24px] h-[24px] px-1 flex justify-center items-center absolute font-bold text-[12px] border border-[#444444] rounded-[4px] text-black -top-[12px] left-1/2 -translate-x-1/2 transition-colors duration-150 ${
                pins.A
                  ? 'bg-[#ffff00] shadow-[0_0_12px_rgba(255,255,0,0.7)]'
                  : 'bg-[#a19e00]'
              }`}
            >
              A:{pins.A ? '1' : '0'}
            </div>

            {/* Pin B (Right) */}
            <div
              className={`min-w-[24px] h-[24px] px-1 flex justify-center items-center absolute font-bold text-[12px] border border-[#444444] rounded-[4px] text-black top-1/2 -right-[12px] -translate-y-1/2 transition-colors duration-150 ${
                pins.B
                  ? 'bg-[#ffff00] shadow-[0_0_12px_rgba(255,255,0,0.7)]'
                  : 'bg-[#a19e00]'
              }`}
            >
              B:{pins.B ? '1' : '0'}
            </div>

            {/* Pin C (Bottom) */}
            <div
              className={`min-w-[24px] h-[24px] px-1 flex justify-center items-center absolute font-bold text-[12px] border border-[#444444] rounded-[4px] text-black -bottom-[12px] left-1/2 -translate-x-1/2 transition-colors duration-150 ${
                pins.C
                  ? 'bg-[#ffff00] shadow-[0_0_12px_rgba(255,255,0,0.7)]'
                  : 'bg-[#a19e00]'
              }`}
            >
              C:{pins.C ? '1' : '0'}
            </div>

            {/* Pin D (Left) */}
            <div
              className={`min-w-[24px] h-[24px] px-1 flex justify-center items-center absolute font-bold text-[12px] border border-[#444444] rounded-[4px] text-black top-1/2 -left-[12px] -translate-y-1/2 transition-colors duration-150 ${
                pins.D
                  ? 'bg-[#ffff00] shadow-[0_0_12px_rgba(255,255,0,0.7)]'
                  : 'bg-[#a19e00]'
              }`}
            >
              D:{pins.D ? '1' : '0'}
            </div>
            </div>
          </div>
        </div>

        {/* Program Box */}
        <div className="bg-black/30 backdrop-blur-sm border border-[#BEF264]/20 rounded-xl p-3 sm:p-4 mt-4">
          <div className="mb-2">
            <label htmlFor="code" className="text-sm font-semibold text-neutral-100">
              Program
            </label>
          </div>
          <textarea
            id="code"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="pistachio-scroll w-full h-[150px] font-mono text-sm leading-relaxed bg-black/45 border border-[#BEF264]/25 rounded-lg p-3 text-[#BEF264] placeholder:text-neutral-600 focus:outline-none focus:border-[#BEF264] focus:ring-2 focus:ring-[#BEF264]/20 transition-colors resize-y"
          />
          <div className="flex flex-wrap gap-2 mt-2.5 items-center">
            <button
              id="run"
              type="button"
              onClick={handleRun}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#BEF264] hover:bg-[#d2f988] text-black font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shadow-[0_0_16px_-3px_rgba(190,242,100,0.6)]"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Run</span>
            </button>
            <button
              id="step"
              type="button"
              onClick={handleStep}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-[#BEF264]/12 text-neutral-100 font-medium text-sm border border-[#BEF264]/25 hover:border-[#BEF264]/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <SkipForward className="w-3.5 h-3.5 text-[#BEF264]" />
              <span>Step</span>
            </button>
            <button
              id="reset"
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-[#BEF264]/12 text-neutral-100 font-medium text-sm border border-[#BEF264]/25 hover:border-[#BEF264]/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#BEF264]/80" />
              <span>Reset pins</span>
            </button>
            <button
              id="showEEPROM"
              type="button"
              onClick={handleShowEEPROM}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-[#BEF264]/12 text-neutral-100 font-medium text-sm border border-[#BEF264]/25 hover:border-[#BEF264]/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Database className="w-3.5 h-3.5 text-[#BEF264]" />
              <span>Show EEPROM</span>
            </button>
            <label className="ml-auto flex items-center gap-2 text-sm text-neutral-200 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                id="autoClear"
                checked={autoClear}
                onChange={(e) => setAutoClear(e.target.checked)}
                className="w-4 h-4 rounded accent-[#BEF264] cursor-pointer"
              />
              <span>Auto-clear log</span>
            </label>
          </div>
        </div>

        {/* Log Box */}
        <div className="bg-black/30 backdrop-blur-sm border border-[#BEF264]/20 rounded-xl p-3 sm:p-4 mt-3.5">
          <div className="mb-2">
            <span className="text-sm font-semibold text-neutral-100">Log</span>
          </div>
          <pre
            id="log"
            ref={logRef}
            className="pistachio-scroll h-[180px] overflow-auto bg-black/45 border border-[#BEF264]/20 rounded-lg p-3 text-[13px] leading-relaxed font-mono text-neutral-200 whitespace-pre-wrap m-0"
          >
            {logText}
          </pre>
        </div>
      </main>
    </div>
  );
}
