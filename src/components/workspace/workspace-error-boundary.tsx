"use client";

import { Component, type ErrorInfo } from "react";

import { ErrorState } from "@/components/error-state";

type State = { failed: boolean };

/**
 * Keeps the sidebar up when the board fails to render — the boards live in
 * the layout, above the `error.tsx` boundary that covers the (empty) pages.
 */
export class WorkspaceErrorBoundary extends Component<
  { children: React.ReactNode },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <ErrorState
          retry={() => this.setState({ failed: false })}
          className="h-full"
        />
      );
    }
    return this.props.children;
  }
}
