/**
 * No blank pages (found 2026-10-01: a stale tab searched, navigated, and
 * fetched a chunk a deploy had removed; nothing caught it).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteErrorBoundary, isStaleChunkError, reloadOnceForStaleChunk } from "./RouteErrorBoundary";

const Boom = ({ message }: { message: string }) => { throw new Error(message); };

describe("the route error boundary", () => {
  afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

  it("recognises a stale-build chunk failure in each browser's words", () => {
    expect(isStaleChunkError(new Error("Failed to fetch dynamically imported module: https://app/assets/CreditOps-abc.js"))).toBe(true);
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("reloads once for a stale chunk, then shows the failure instead of looping", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload, pathname: "/app/creditops" }, writable: true });
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders a readable notice with Reload and Home for any other error, never a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RouteErrorBoundary><Boom message="Cannot read properties of undefined (reading 'name')" /></RouteErrorBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("This page hit a problem")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to home/i }).getAttribute("href")).toBe("/app");
    expect(screen.getByText(/reading 'name'/)).toBeTruthy();
  });
});
