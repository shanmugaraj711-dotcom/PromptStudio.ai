import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SIZE = 20;
const START = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
const THEMES = {
  retro: { label: "Classic Retro", page: "bg-[#10210f]", panel: "bg-[#183116]", grid: "border-[#38572b]", snake: "bg-[#b8ef54]", head: "bg-[#e9ff9a]", food: "bg-[#ffcc33]", text: "text-[#e9ff9a]", muted: "text-[#9db58d]", button: "bg-[#b8ef54] text-[#10210f]" },
  neon: { label: "Neon Cyberpunk", page: "bg-[#08051a]", panel: "bg-[#110b2c]", grid: "border-fuchsia-500/20", snake: "bg-cyan-300", head: "bg-white", food: "bg-fuchsia-400", text: "text-cyan-200", muted: "text-violet-300", button: "bg-cyan-300 text-[#071018]" },
  modern: { label: "Clean Modern", page: "bg-[#f4f6f8]", panel: "bg-white", grid: "border-slate-200", snake: "bg-slate-700", head: "bg-slate-900", food: "bg-rose-400", text: "text-slate-900", muted: "text-slate-500", button: "bg-slate-900 text-white" },
};

const spawnFood = (snake) => {
  const open = [];
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) if (!snake.some((part) => part.x === x && part.y === y)) open.push({ x, y });
  return open[Math.floor(Math.random() * open.length)] || { x: 0, y: 0 };
};

export default function SnakePreview() {
  const [theme, setTheme] = useState("retro");
  const [snake, setSnake] = useState(START);
  const [food, setFood] = useState(() => spawnFood(START));
  const [direction, setDirection] = useState("right");
  const [queued, setQueued] = useState("right");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(window.localStorage.getItem("promptstudio-snake-best") || 0));
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const touchStart = useRef(null);
  const t = THEMES[theme];

  const restart = useCallback(() => {
    const initial = [...START];
    setSnake(initial); setFood(spawnFood(initial)); setDirection("right"); setQueued("right"); setScore(0); setGameOver(false); setRunning(true);
  }, []);

  const changeDirection = useCallback((next) => {
    setQueued((current) => OPPOSITE[current] === next ? current : next);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const map = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", " ": "pause" };
      const next = map[event.key];
      if (!next) return;
      event.preventDefault();
      if (next === "pause") setRunning((value) => !value);
      else changeDirection(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeDirection]);

  useEffect(() => {
    if (!running || gameOver) return undefined;
    const timer = window.setInterval(() => {
      setDirection(queued);
      setSnake((current) => {
        const head = current[0];
        const delta = DIRECTIONS[queued];
        const nextHead = { x: head.x + delta.x, y: head.y + delta.y };
        const hitWall = nextHead.x < 0 || nextHead.x >= SIZE || nextHead.y < 0 || nextHead.y >= SIZE;
        const ate = nextHead.x === food.x && nextHead.y === food.y;
        const body = ate ? current : current.slice(0, -1);
        const hitSelf = body.some((part) => part.x === nextHead.x && part.y === nextHead.y);
        if (hitWall || hitSelf) { setGameOver(true); setRunning(false); return current; }
        const nextSnake = [nextHead, ...body];
        if (ate) { setScore((value) => { const next = value + 1; setBest((old) => { const high = Math.max(old, next); window.localStorage.setItem("promptstudio-snake-best", String(high)); return high; }); return next; }); setFood(spawnFood(nextSnake)); }
        return nextSnake;
      });
    }, 115);
    return () => window.clearInterval(timer);
  }, [food, gameOver, queued, running]);

  const cells = useMemo(() => Array.from({ length: SIZE * SIZE }, (_, index) => ({ x: index % SIZE, y: Math.floor(index / SIZE) })), []);
  const isSnake = (cell) => snake.some((part) => part.x === cell.x && part.y === cell.y);
  const isHead = (cell) => snake[0]?.x === cell.x && snake[0]?.y === cell.y;

  const onTouchStart = (event) => { const touch = event.changedTouches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; };
  const onTouchEnd = (event) => { if (!touchStart.current) return; const touch = event.changedTouches[0]; const dx = touch.clientX - touchStart.current.x; const dy = touch.clientY - touchStart.current.y; touchStart.current = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return; changeDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")); };

  return <div className={`rounded-2xl p-3 sm:p-4 ${t.page}`}>
    <div className={`rounded-xl p-3 ${t.panel}`}>
      <div className="flex items-center justify-between gap-2"><div><p className={`text-[9px] font-black uppercase tracking-[0.18em] ${t.text}`}>Interactive Simulation</p><p className={`mt-1 text-sm font-black ${t.text}`}>2D Snake</p></div><button type="button" onClick={() => setRunning((value) => !value)} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-black ${t.button}`}>{running ? "Pause" : gameOver ? "Game Over" : "Resume"}</button></div>
      <div className="mt-3 flex items-center justify-between gap-2"><span className={`text-[10px] font-bold ${t.muted}`}>Score <b className={t.text}>{score}</b></span><span className={`text-[10px] font-bold ${t.muted}`}>Best <b className={t.text}>{best}</b></span><select aria-label="Snake theme" value={theme} onChange={(event) => setTheme(event.target.value)} className="rounded-lg border border-black/10 bg-black/10 px-2 py-1 text-[9px] font-bold"><option value="retro">Classic Retro</option><option value="neon">Neon Cyberpunk</option><option value="modern">Clean Modern</option></select></div>
      <div className="mx-auto mt-3 aspect-square w-full max-w-[330px] overflow-hidden rounded-xl border-2 border-black/10 bg-black/20 p-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} role="application" aria-label="Snake game preview">
        <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}>{cells.map((cell) => <div key={`${cell.x}-${cell.y}`} className={`relative border ${t.grid} ${isHead(cell) ? t.head : isSnake(cell) ? t.snake : cell.x === food.x && cell.y === food.y ? t.food : ""}`} />)}</div>
        {(!running || gameOver) && <div className="absolute inset-0 grid place-items-center"><div className="rounded-xl bg-black/75 px-4 py-3 text-center text-white"><p className="text-xs font-black">{gameOver ? "Game Over" : "Paused"}</p>{gameOver && <p className="mt-1 text-[10px] text-white/70">Score {score}</p>}{gameOver && <button type="button" onClick={restart} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-[9px] font-black text-black">Restart</button>}</div></div>}
      </div>
      <div className="mx-auto mt-3 grid max-w-[220px] grid-cols-3 gap-1.5" aria-label="Snake directional controls"><span /><button type="button" onClick={() => changeDirection("up")} className={`rounded-lg py-2 text-xs font-black ${t.button}`}>↑</button><span /><button type="button" onClick={() => changeDirection("left")} className={`rounded-lg py-2 text-xs font-black ${t.button}`}>←</button><button type="button" onClick={() => changeDirection("down")} className={`rounded-lg py-2 text-xs font-black ${t.button}`}>↓</button><button type="button" onClick={() => changeDirection("right")} className={`rounded-lg py-2 text-xs font-black ${t.button}`}>→</button></div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2"><button type="button" onClick={restart} className={`rounded-lg px-3 py-1.5 text-[9px] font-black ${t.button}`}>Restart game</button><span className={`text-[9px] ${t.muted}`}>Swipe or use Arrow / WASD keys</span></div>
    </div>
  </div>;
}
