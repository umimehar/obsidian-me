import { Component } from "react";
import type { ReactNode } from "react";
import { DataError } from "./DataError";

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

/**
 * The one place a data failure becomes visible instead of fatal.
 *
 * `parseAnalytics` and `parseReconciliation` throw on a payload they cannot
 * vouch for, which is the right call: a dashboard that renders half a
 * portfolio is worse than one that says it cannot. This turns that throw
 * into a page that names the failure and the command that fixes it, rather
 * than React unmounting the tree and leaving a white screen.
 *
 * A class is not a style choice here. React has no hook equivalent for
 * catching a render error.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.message !== null) return <DataError message={this.state.message} />;
    return this.props.children;
  }
}
