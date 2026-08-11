import { Component, type ReactNode, type RefObject } from "react";

interface Props {
  children: ReactNode;
  onExit: () => void;
  restoreFocusRef: RefObject<HTMLButtonElement>;
}

export class ComparisonBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  private exit = (): void => {
    this.props.onExit();
    requestAnimationFrame(() => this.props.restoreFocusRef.current?.focus());
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="rounded-3xl bg-white/10 p-6" role="alert">
        <h1 className="text-lg font-semibold">Comparison could not be opened</h1>
        <p className="mt-2 text-sm text-white/65">The full dashboard is still available.</p>
        <button type="button" onClick={this.exit} className="mt-4 rounded-full bg-white/15 px-4 py-2.5 text-sm">Return to full dashboard</button>
      </section>
    );
  }
}
