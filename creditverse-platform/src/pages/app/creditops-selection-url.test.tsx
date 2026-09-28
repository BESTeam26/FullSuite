/**
 * Choosing a partner has to survive the rest of the click.
 *
 * Dee, 2026-09-28: "regardless of which Partner I click under Managed Ops or
 * Outsourcing, the Partner pages/buttons are sometimes not responding or not
 * loading correctly."
 *
 * The cause was not the click handler. `setSearchParams(fn)` hands `fn` the
 * params from the LAST RENDER, so two calls in one event handler both start
 * from the pre-click value and the second discards the first. Selecting a
 * partner did exactly that — `partner=X` written, then overwritten by a
 * `view` patch that had never seen it.
 *
 * This reproduces the shape rather than the screen: two patches in one
 * handler, which is what every selection in CreditOps does.
 */
import { describe, expect, it } from "vitest";
import { useCallback, useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams, useLocation } from "react-router-dom";

/** The hook exactly as CreditOps defines it. */
function usePatchParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;
  return useCallback(
    (patch: (p: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(paramsRef.current);
      patch(next);
      paramsRef.current = next;
      setSearchParams(next, { replace });
    },
    [setSearchParams],
  );
}

/** The BROKEN version, kept so the test proves it is testing something. */
function useStalePatchParams() {
  const [, setSearchParams] = useSearchParams();
  return useCallback(
    (patch: (p: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        patch(next);
        return next;
      });
    },
    [setSearchParams],
  );
}

const Harness = ({ broken }: { broken: boolean }) => {
  const patch = broken ? useStalePatchParams() : usePatchParams();
  const loc = useLocation();
  return (
    <>
      <button
        onClick={() => {
          /* Exactly what selecting a partner does: set the partner, then set
             the workspace tab, in one handler. */
          patch((p) => { p.set("partner", "p-vanquish"); p.set("view", "main-list"); });
          patch((p) => p.set("view", "main-list"));
        }}
      >
        Vanquish Ventures
      </button>
      <div data-testid="search">{loc.search}</div>
    </>
  );
};

const clickPartner = (broken: boolean) => {
  window.history.replaceState({}, "", "/app/creditops?view=mgmt-main-list");
  render(
    <MemoryRouter initialEntries={["/app/creditops?view=mgmt-main-list"]}>
      <Harness broken={broken} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Vanquish Ventures" }));
  return screen.getByTestId("search").textContent ?? "";
};

describe("selecting a partner", () => {
  it("keeps the partner when the same click also sets the view", () => {
    expect(clickPartner(false)).toContain("partner=p-vanquish");
  });

  it("would have lost it with the render-snapshot version", () => {
    /* The regression itself, pinned. If react-router ever changes so that a
       functional update sees the latest params, this case fails and the extra
       machinery above can go. */
    expect(clickPartner(true)).not.toContain("partner=p-vanquish");
  });
});
