import { useMemo } from "react";

interface BackdropProps {
  wet: boolean;
  isDay: boolean;
  storm: boolean;
}

const BOKEH: ReadonlyArray<readonly [string, number, number, number]> = [
  ["#ff4b3e", 8, 74, 190], ["#ffb347", 21, 88, 130], ["#5ad1ff", 3, 62, 150],
  ["#ff7a45", 34, 92, 110], ["#ffd76e", 62, 84, 140], ["#ff3b30", 79, 71, 170],
  ["#4fa8ff", 91, 86, 130], ["#ffe0a3", 47, 95, 120], ["#7be0c0", 68, 66, 110],
  ["#ff9ec7", 14, 55, 120],
];

function sky(isDay: boolean, wet: boolean, storm: boolean): string {
  if (!isDay) return "linear-gradient(180deg,#050a14 0%,#0d1a2e 45%,#16283f 100%)";
  if (storm) return "linear-gradient(180deg,#2b3a4a 0%,#3d5164 45%,#55697d 100%)";
  if (wet) return "linear-gradient(180deg,#243a52 0%,#3a5c7d 48%,#5b7f9e 100%)";
  return "linear-gradient(180deg,#1b4a8f 0%,#2f7fc4 50%,#68b3e0 100%)";
}

export function Backdrop({ wet, isDay, storm }: BackdropProps) {
  const drops = useMemo(
    () =>
      Array.from({ length: 46 }, (_, id) => ({
        id,
        left: Math.random() * 100,
        top: Math.random() * 100,
        len: 18 + Math.random() * 46,
        dur: 0.55 + Math.random() * 0.9,
        delay: Math.random() * 3,
        op: 0.1 + Math.random() * 0.3,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: sky(isDay, wet, storm) }} aria-hidden="true">
      <div className="absolute inset-0" style={{ opacity: isDay ? 0.28 : 0.85 }}>
        {BOKEH.map(([c, x, y, s], i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, background: c, filter: "blur(38px)", opacity: 0.55 }}
          />
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%)" }}
      />
      {wet && (
        <div className="absolute inset-0 rainlayer">
          {drops.map((d) => (
            <span
              key={d.id}
              className="absolute rainstreak"
              style={{
                left: `${d.left}%`,
                top: `${d.top}%`,
                height: d.len,
                opacity: d.op,
                animationDuration: `${d.dur}s`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
