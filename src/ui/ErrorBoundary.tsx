import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: a readable sheet instead of a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <span className="tape">Survey interrupted</span>
        <h1>Something on this page broke.</h1>
        <p>Your data never left this tab, so nothing is lost on our side. Reload to start again, or go back to the first page.</p>
        <pre className="mono small">{this.state.error.message}</pre>
        <div className="row">
          <button className="btn btn--ink" onClick={() => location.reload()}>Reload</button>
          <a className="btn" href="/">Home</a>
        </div>
      </div>
    );
  }
}
