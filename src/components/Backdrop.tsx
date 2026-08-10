import { useMemo } from "react";
import { sceneParticles, type WeatherScene } from "../lib/scene";

interface BackdropProps {
  scene: WeatherScene;
}

const BOKEH: ReadonlyArray<readonly [string, number, number, number]> = [
  ["#ff4b3e", 8, 74, 190], ["#ffb347", 21, 88, 130], ["#5ad1ff", 3, 62, 150],
  ["#ff7a45", 34, 92, 110], ["#ffd76e", 62, 84, 140], ["#ff3b30", 79, 71, 170],
  ["#4fa8ff", 91, 86, 130], ["#ffe0a3", 47, 95, 120], ["#7be0c0", 68, 66, 110],
  ["#ff9ec7", 14, 55, 120],
];

function sky(scene: WeatherScene): string {
  if (!scene.isDay) {
    return scene.kind === "storm" || scene.kind === "overcast"
      ? "linear-gradient(180deg,#05070c 0%,#111a28 48%,#263449 100%)"
      : "linear-gradient(180deg,#020714 0%,#0a1730 48%,#17345b 100%)";
  }
  if (scene.kind === "storm") return "linear-gradient(180deg,#202d3a 0%,#354858 48%,#566a78 100%)";
  if (scene.kind === "rain" || scene.kind === "overcast") return "linear-gradient(180deg,#263b50 0%,#47647b 48%,#718a9d 100%)";
  if (scene.kind === "fog") return "linear-gradient(180deg,#667784 0%,#91a0a8 52%,#b7c0c3 100%)";
  if (scene.kind === "snow") return "linear-gradient(180deg,#4e6c85 0%,#829bad 52%,#b5c2ca 100%)";
  return "linear-gradient(180deg,#1253a0 0%,#2e88cc 52%,#87ccec 100%)";
}

export function Backdrop({ scene }: BackdropProps) {
  const particles = useMemo(
    () => sceneParticles(scene, scene.particleCount),
    [scene]
  );
  const stars = useMemo(() => sceneParticles(scene, 36), [scene]);
  const precipitation = scene.kind === "rain" || scene.kind === "storm" || scene.kind === "snow";
  const cloudy = scene.kind === "partly-cloudy" || scene.kind === "overcast" || scene.kind === "rain" || scene.kind === "snow" || scene.kind === "storm";

  return (
    <div
      className="absolute inset-0 overflow-hidden weather-backdrop"
      style={{ background: sky(scene) }}
      aria-hidden="true"
      data-testid="weather-backdrop"
      data-scene={scene.kind}
      data-intensity={scene.intensity}
    >
      {!scene.isDay && scene.kind !== "overcast" && scene.kind !== "storm" && (
        <div className="absolute inset-0 scene-stars">
          {stars.map((star) => (
            <i
              key={star.id}
              className="absolute rounded-full bg-white"
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: 1 + (star.id % 3),
                height: 1 + (star.id % 3),
                opacity: 0.28 + (star.id % 5) * 0.1,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {scene.isDay && scene.kind === "clear" && <div className="absolute scene-sun" />}

      {cloudy && (
        <div className="absolute inset-0 scene-clouds" style={{ opacity: 0.3 + scene.cloudCover / 180 }}>
          <span />
          <span />
          <span />
        </div>
      )}

      {scene.kind === "fog" && <div className="absolute inset-0 scene-fog" />}

      <div className="absolute inset-0" style={{ opacity: scene.isDay ? 0.2 : 0.72 }}>
        {BOKEH.map(([color, x, y, size], index) => (
          <div
            key={index}
            className="absolute rounded-full"
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: color, filter: "blur(38px)", opacity: 0.5 }}
          />
        ))}
      </div>

      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%)" }}
      />

      {precipitation && (
        <div className="absolute inset-0 weather-particles">
          {particles.map((particle) => (
            <span
              key={particle.id}
              className={scene.kind === "snow" ? "scene-snowflake" : "rainstreak"}
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                width: scene.kind === "snow" ? 2 + (particle.id % 4) : undefined,
                height: scene.kind === "snow" ? 2 + (particle.id % 4) : particle.size,
                opacity: particle.opacity,
                animationDuration: `${scene.kind === "snow" ? particle.duration * 4 : particle.duration}s`,
                animationDelay: `${particle.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {scene.kind === "storm" && <div className="absolute inset-0 scene-storm-flash" />}
    </div>
  );
}
