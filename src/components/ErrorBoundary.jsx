import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "The workspace hit an unexpected error." };
  }

  componentDidCatch(error, info) {
    console.error("PromptStudio UI error boundary", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="min-h-[60vh] bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-xl">🤖</div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Workspace recovered</p>
          <h1 className="mt-2 text-2xl font-black">Something went off track.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{this.state.message}</p>
          <button type="button" onClick={this.handleReset} className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-50">Try again</button>
        </div>
      </main>
    );
  }
}
