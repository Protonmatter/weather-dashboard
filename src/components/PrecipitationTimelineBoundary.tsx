import { Component, type ErrorInfo, type ReactNode } from "react";

interface PrecipitationTimelineBoundaryProps {
  active: boolean;
  children: ReactNode;
  onReturnToForecast: () => void;
}

interface PrecipitationTimelineBoundaryState {
  failed: boolean;
}

/** Contains failures from the optional precipitation chunk inside precipitation mode. */
export class PrecipitationTimelineBoundary extends Component<
  PrecipitationTimelineBoundaryProps,
  PrecipitationTimelineBoundaryState
> {
  override state: PrecipitationTimelineBoundaryState = { failed: false };

  static getDerivedStateFromError(): PrecipitationTimelineBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Precipitation timeline module failed", error, info);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        id="precipitation-map-mode-panel"
        role="tabpanel"
        aria-labelledby="precipitation-map-tab"
        hidden={!this.props.active}
        className="mt-3"
        data-testid="precipitation-panel-error"
      >
        <div role="alert" className="text-xs text-white/75">
          <p>Precipitation timeline controls could not be loaded. Forecast fields remain available.</p>
          <button
            type="button"
            className="mt-3 min-h-11 rounded-xl border border-white/25 bg-white/10 px-3 underline"
            onClick={this.props.onReturnToForecast}
          >
            Return to forecast
          </button>
        </div>
      </div>
    );
  }
}
