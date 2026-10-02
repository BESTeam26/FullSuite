/**
 * The header search lands here as ?q= (2026-10-02). The Clients page starts
 * filtered by it, and follows a new search made while already open.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { PortalClientsPage } from "./PortalClientsPage";

vi.mock("@/lib/data/use-agency-partners", () => ({
  useMyPartnerClients: () => ({ data: [], isLoading: false, isPending: false, isError: false, error: null, status: "success" }),
}));

function SearchAgain() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/partner/clients?q=sam")}>search again</button>;
}

describe("the Clients page and the header search", () => {
  it("starts filtered by the term from the header, and follows a new one", () => {
    render(<MemoryRouter initialEntries={["/partner/clients?q=jordan"]}><SearchAgain /><PortalClientsPage /></MemoryRouter>);
    const box = screen.getByPlaceholderText(/Name, reference or next step/) as HTMLInputElement;
    expect(box.value).toBe("jordan");
    fireEvent.click(screen.getByText("search again"));
    expect(box.value).toBe("sam");
  });
});
