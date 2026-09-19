/**
 * /app/teams was Structure | Positions | Org chart. Those are sections of
 * People & Teams now; old links, including the Org Chart's `?team=` deep
 * links, land on the section they meant.
 */
import { Navigate, useSearchParams } from "react-router-dom";

const TAB_TO_SECTION: Record<string, string> = {
  structure: "structure", positions: "positions", "org-chart": "org-chart",
};

export const LegacyTeamsRedirect = () => {
  const [params] = useSearchParams();
  const section = TAB_TO_SECTION[params.get("tab") ?? ""] ?? "structure";
  const team = params.get("team");
  return <Navigate to={`/app/people/${section}${team ? `?team=${encodeURIComponent(team)}` : ""}`} replace />;
};
