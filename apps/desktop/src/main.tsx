import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import type { DesktopAPI } from "../../../packages/contracts";
declare global {
  interface Window {
    pam: DesktopAPI;
  }
}
class Boundary extends React.Component<
  React.PropsWithChildren,
  { error: string | null }
> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>Workspace could not render</h1>
        <p role="alert">{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload workspace</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
