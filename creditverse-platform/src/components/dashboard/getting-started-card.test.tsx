/**
 * Two people, two guides — and never the wrong one.
 *
 * An administrator is asked to set the company up. A processor is asked only
 * about their own profile: company setup is not their job, so it is not shown
 * to them at all (rule 3 — if a person cannot use something, do not render
 * it). The permission check is the same `settings.manage` / `team.manage` the
 * database enforces on those settings screens, so the guide never offers a
 * step that would be refused on arrival.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GettingStartedCard } from "@/components/dashboard/GettingStartedCard";

let permissions: { can: (keys: string[]) => boolean; loading: boolean };
let orgData: Record<string, unknown> | null;
let memberData: Record<string, unknown> | null;

vi.mock("@/lib/auth/use-permission", () => ({
  usePermissions: () => permissions,
}));

let memberOf: string[] = [];

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ orgMemberships: memberOf.map((organization_id) => ({ organization_id })) }),
}));

vi.mock("@/lib/data/use-first-run", () => ({
  useOrganizationFirstRun: (id: string | null) => ({ data: id ? orgData : undefined, isLoading: false }),
  useMemberFirstRun: (enabled: boolean) => ({ data: enabled ? memberData : undefined, isLoading: false }),
}));

const ORG = "11111111-2222-4333-8444-555555555555";

const show = () =>
  render(
    <MemoryRouter>
      <GettingStartedCard organizationId={ORG} enabledModules={["creditOps"]} />
    </MemoryRouter>,
  );

beforeEach(() => {
  orgData = {
    brandingSet: false, teammates: 0, clients: 0, creditReports: 0,
    letterTemplates: 0, kpisChosen: 0, fundingFiles: 0, hubChoices: 0, automations: 0,
  };
  memberData = { avatarSet: false, phoneSet: false, preferredNameSet: false, birthdayShared: false };
  memberOf = [ORG];
});

describe("the first-run guide on an organization's Home", () => {
  it("gives an administrator the company setup", () => {
    permissions = { can: () => true, loading: false };
    show();
    expect(screen.getByText("Getting started")).toBeInTheDocument();
    expect(screen.getByText(/Brand your workspace/)).toBeInTheDocument();
    expect(screen.getByText(/Invite your team/)).toBeInTheDocument();
  });

  it("gives everyone else their own profile, and none of the company setup", () => {
    permissions = { can: () => false, loading: false };
    show();
    expect(screen.getByText("Welcome — finish setting yourself up")).toBeInTheDocument();
    expect(screen.getByText(/Add your photo/)).toBeInTheDocument();
    expect(screen.queryByText(/Brand your workspace/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Invite your team/)).not.toBeInTheDocument();
  });

  it("asks for nothing while permissions are still loading", () => {
    permissions = { can: () => true, loading: true };
    const { container } = show();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
  });

  it("says nothing to BES staff looking at somebody else's workspace", () => {
    permissions = { can: () => false, loading: false };
    memberOf = [];
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it("goes away once the required steps are done", () => {
    permissions = { can: () => false, loading: false };
    memberData = { avatarSet: true, phoneSet: true, preferredNameSet: false, birthdayShared: false };
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });
});
