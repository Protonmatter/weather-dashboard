import { Target } from "lucide-react";
import { Card } from "./Card";
import { MIN_CONFIDENT_SAMPLES, type Scorecard } from "../lib/verification/verify";

const dim = "rgba(255,255,255,0.55)";
const faint = "rgba(255,255,255,0.18)";

/**
 * Reliability diagram. Perfect calibration lies on the diagonal: of every occasion you
 * said 30%, it should happen 30% of the time. Bins are sized by sample count so a point
 * resting on five observations does not read as strongly as one resting on five hundred.
 */
function ReliabilityDiagram({ bins }: { bins: Scorecard["reliability"] }) {
  const populated = bins.filter((b) => b.count > 0);
  const maxCount = Math.max(1, ...populated.map((b) => b.count));
  const X = (v: number): number => 8 + v * 92;
  const Y = (v: number): number => 100 - v * 92;

  return (
    <svg viewBox="0 0 108 108" className="w-full" role="img" aria-label="Reliability diagram">
      <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(0)} stroke={faint} strokeWidth="0.6" />
      <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(1)} stroke={faint} strokeWidth="0.6" />
      <line
        x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)}
        stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" strokeDasharray="2 2"
      />
      {populated.length > 1 && (
        <polyline
          points={populated.map((b) => `${X(b.meanForecast)},${Y(b.observedFrequency)}`).join(" ")}
          fill="none"
          stroke="#7ce0ff"
          strokeWidth="1.1"
        />
      )}
      {populated.map((b, i) => (
        <circle
          key={i}
          cx={X(b.meanForecast)}
          cy={Y(b.observedFrequency)}
          r={1.4 + 2.2 * Math.sqrt(b.count / maxCount)}
          fill="#7ce0ff"
          opacity={0.85}
        />
      ))}
    </svg>
  );
}

/**
 * Talagrand rank histogram. Flat means the ensemble spread matches reality. U-shaped
 * means under-dispersed — the truth keeps landing outside the ensemble, which is the
 * failure mode that makes a confident-looking forecast dangerous.
 */
function RankHistogram({ ranks }: { ranks: readonly number[] }) {
  const total = ranks.reduce((a, b) => a + b, 0);
  if (total === 0 || ranks.length === 0) return null;
  const expected = total / ranks.length;
  const max = Math.max(...ranks, expected);

  return (
    <svg viewBox="0 0 108 48" className="w-full" role="img" aria-label="Ensemble rank histogram">
      <line
        x1="0" y1={44 - (expected / max) * 40} x2="108" y2={44 - (expected / max) * 40}
        stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" strokeDasharray="2 2"
      />
      {ranks.map((count, i) => {
        const w = 108 / ranks.length;
        const h = (count / max) * 40;
        return (
          <rect
            key={i}
            x={i * w + 0.3}
            y={44 - h}
            width={Math.max(0.6, w - 0.6)}
            height={h}
            fill="rgba(124,224,255,0.75)"
            rx="0.4"
          />
        );
      })}
      <line x1="0" y1="44" x2="108" y2="44" stroke={faint} strokeWidth="0.6" />
    </svg>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex-1" style={{ minWidth: 74 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: dim }}>{hint}</div>}
    </div>
  );
}

function skillNote(s: Scorecard): string {
  if (s.brierSkill === null) return "Skill is undefined while the outcome never varies.";
  if (s.brierSkill > 0.05) return "The forecast is beating climatology on this sample.";
  if (s.brierSkill < -0.05) return "The forecast is losing to climatology on this sample.";
  return "The forecast is roughly matching climatology on this sample.";
}

function dispersionNote(s: Scorecard): string {
  if (s.ranks.length === 0) return "";
  const total = s.ranks.reduce((a, b) => a + b, 0);
  if (total < 20) return "";
  const edges = (s.ranks[0] ?? 0) + (s.ranks[s.ranks.length - 1] ?? 0);
  const expectedEdges = (2 / s.ranks.length) * total;
  if (edges > expectedEdges * 1.8) return "U-shaped: the ensemble looks under-dispersed.";
  if (edges < expectedEdges * 0.4) return "Domed: the ensemble looks over-dispersed.";
  return "Roughly flat: ensemble spread looks consistent with outcomes.";
}

export function VerificationPanel({ score }: { score: Scorecard }) {
  if (score.samples === 0) {
    return (
      <Card title="Forecast Verification" icon={Target} className="fadein">
        <p style={{ fontSize: 12.5, color: dim, lineHeight: 1.45 }}>
          No scored forecasts yet. Each forecast is archived when it loads and scored once its
          hour has elapsed, so calibration builds up over days of use rather than appearing
          immediately.
        </p>
      </Card>
    );
  }

  const d = score.decomposition;

  return (
    <Card title="Forecast Verification" icon={Target} className="fadein">
      {!score.confident && (
        <p
          className="rounded-xl px-2.5 py-2 mb-3"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            color: "rgba(255,224,163,0.95)",
            background: "rgba(255,200,100,0.12)",
            border: "1px solid rgba(255,200,100,0.25)",
          }}
        >
          Provisional — {score.samples} of {MIN_CONFIDENT_SAMPLES} scored forecasts. These numbers
          are dominated by sampling noise until the archive grows.
        </p>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <Stat label="BRIER" value={score.brier.toFixed(3)} hint="0 is perfect" />
        <Stat
          label="SKILL"
          value={score.brierSkill === null ? "—" : score.brierSkill.toFixed(2)}
          hint="vs climatology"
        />
        <Stat label="CRPS" value={score.crps.toFixed(3)} hint="inches" />
        <Stat label="SAMPLES" value={String(score.samples)} hint={`${score.locations} location(s)`} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
            RELIABILITY
          </div>
          <ReliabilityDiagram bins={score.reliability} />
          <div className="flex justify-between" style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
            <span>0%</span>
            <span>FORECAST</span>
            <span>100%</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
            RANK HISTOGRAM
          </div>
          <RankHistogram ranks={score.ranks} />
          <div style={{ fontSize: 10, color: dim, lineHeight: 1.35, marginTop: 2 }}>
            {dispersionNote(score)}
          </div>
        </div>
      </div>

      <dl
        className="grid gap-x-3 gap-y-1 mt-4 pt-3"
        style={{ gridTemplateColumns: "auto 1fr", fontSize: 11, borderTop: "1px solid rgba(255,255,255,0.12)" }}
      >
        <dt style={{ color: dim }}>Reliability</dt>
        <dd style={{ textAlign: "right" }}>{d.reliability.toFixed(4)} — lower is better</dd>
        <dt style={{ color: dim }}>Resolution</dt>
        <dd style={{ textAlign: "right" }}>{d.resolution.toFixed(4)} — higher is better</dd>
        <dt style={{ color: dim }}>Uncertainty</dt>
        <dd style={{ textAlign: "right" }}>{d.uncertainty.toFixed(4)} — event difficulty</dd>
        <dt style={{ color: dim }}>Residual</dt>
        <dd style={{ textAlign: "right" }}>{d.residual.toFixed(4)} — within-bin</dd>
      </dl>

      <p style={{ fontSize: 11, color: dim, marginTop: 10, lineHeight: 1.4 }}>
        {skillNote(score)} Base rate {(score.baseRate * 100).toFixed(0)}%. Verified against
        Open-Meteo's best-estimate analysis, not station observations, and archived locally on this
        device — so scores reflect your own usage, not a shared record.
      </p>
    </Card>
  );
}
