import { pullRequestCI } from "../stack/stack.js";
import { summarizeChecks } from "./ci-status.js";
import StatusIcon from "./StatusIcon.jsx";

export default function CheckIndicators({ details, linkToChecks }) {
  const checks = details.checkRuns ?? [];
  return <span className="check-indicators" aria-label="Checks">
    {checks.length ? checks.map((check, index) => {
      const icon = <StatusIcon shape="check" kind={pullRequestCI({ checkRuns: [check] })} label={`${check.name ?? check.context ?? "Check"}: ${summarizeChecks([check])}`} />;
      const url = check.detailsUrl ?? check.targetUrl;
      return linkToChecks && /^https:\/\//i.test(url ?? "") ? <a key={index} href={url} target="_blank" rel="noreferrer">{icon}</a> : <span key={index}>{icon}</span>;
    }) : <StatusIcon shape="check" kind={details.ci ?? "none"} label={details.ci ? `Checks: ${details.ci}` : "No checks reported"} />}
  </span>;
}
