import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Suspense, lazy, useState, type ComponentType } from "react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import {
  useRouteTransition,
  useShownLocation,
  ShownLocationContext,
} from "./use-route-transition";

/** A screen that suspends until the test releases it. */
const deferred = (label: string) => {
  let release: (() => void) | undefined;
  const ready = new Promise<{ default: ComponentType }>((resolve) => {
    release = () => resolve({ default: () => <p>{label}</p> });
  });
  return { Component: lazy(() => ready), release: release! };
};

const Shell = ({ slow }: { slow: ComponentType }) => {
  const { location, pending } = useRouteTransition();
  const navigate = useNavigate();
  const Slow = slow;
  return (
    <>
      <span data-testid="pending">{pending ? "pending" : "idle"}</span>
      <button onClick={() => navigate("/slow")}>go</button>
      <Suspense fallback={<p>FALLBACK</p>}>
        <Routes location={location}>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/slow" element={<Slow />} />
        </Routes>
      </Suspense>
    </>
  );
};

describe("useRouteTransition", () => {
  it("keeps the current screen on screen while the next one loads", async () => {
    const slow = deferred("Slow screen");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Shell slow={slow.Component} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Home")).toBeTruthy();

    await act(async () => {
      screen.getByText("go").click();
    });

    // The point of the whole exercise: no blank, no skeleton — the screen the
    // person was reading is still there while the next one is fetched.
    expect(screen.queryByText("FALLBACK")).toBeNull();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByTestId("pending").textContent).toBe("pending");

    await act(async () => {
      slow.release();
      await slow;
    });

    expect(screen.getByText("Slow screen")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.getByTestId("pending").textContent).toBe("idle");
  });

  it("does not defer the very first render", () => {
    const First = () => {
      const { location, pending } = useRouteTransition();
      return (
        <span data-testid="state">
          {location.pathname}:{pending ? "pending" : "idle"}
        </span>
      );
    };
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <First />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("state").textContent).toBe("/app/settings:idle");
  });

  it("swaps on a replace navigation, which reuses the history key", async () => {
    const Probe = () => {
      const { location } = useRouteTransition();
      const navigate = useNavigate();
      return (
        <>
          <span data-testid="shown">{location.pathname}</span>
          <button onClick={() => navigate("/other", { replace: true })}>replace</button>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Probe />
      </MemoryRouter>,
    );
    await act(async () => {
      screen.getByText("replace").click();
    });
    expect(screen.getByTestId("shown").textContent).toBe("/other");
  });

  it("follows a change of query string on the same path", async () => {
    const Probe = () => {
      const { location } = useRouteTransition();
      const navigate = useNavigate();
      return (
        <>
          <span data-testid="shown">{location.search}</span>
          <button onClick={() => navigate("/deals?view=funded")}>filter</button>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={["/deals"]}>
        <Probe />
      </MemoryRouter>,
    );
    await act(async () => {
      screen.getByText("filter").click();
    });
    expect(screen.getByTestId("shown").textContent).toBe("?view=funded");
  });

  it("stays idle when nothing navigates", () => {
    const Probe = () => {
      const { pending } = useRouteTransition();
      const [, force] = useState(0);
      return (
        <>
          <span data-testid="pending">{pending ? "pending" : "idle"}</span>
          <button onClick={() => force((n) => n + 1)}>rerender</button>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Probe />
      </MemoryRouter>,
    );
    act(() => screen.getByText("rerender").click());
    expect(screen.getByTestId("pending").textContent).toBe("idle");
  });
});

describe("useShownLocation", () => {
  const Probe = () => <span data-testid="shown">{useShownLocation().pathname}</span>;

  it("reports the screen on display, not the address bar", () => {
    render(
      <MemoryRouter initialEntries={["/app/reporting"]}>
        <ShownLocationContext.Provider
          value={{ pathname: "/app", search: "", hash: "", state: null, key: "k" }}
        >
          <Probe />
        </ShownLocationContext.Provider>
      </MemoryRouter>,
    );
    // The address bar says /app/reporting; the screen still showing is /app.
    expect(screen.getByTestId("shown").textContent).toBe("/app");
  });

  it("falls back to the router outside a transition", () => {
    render(
      <MemoryRouter initialEntries={["/app/settings"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("shown").textContent).toBe("/app/settings");
  });
});
