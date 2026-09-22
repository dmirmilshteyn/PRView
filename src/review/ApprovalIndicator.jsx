import { approvalStatus } from "./approval.js";
import StatusIcon from "./StatusIcon.jsx";

export default function ApprovalIndicator({ details }) {
  const status = details.approval ?? approvalStatus(details);
  return <span className="approval-indicator"><StatusIcon shape="approval" kind={status.approved ? "success" : "none"} label={`${status.label} (last synced)`} />{status.byYou && <span className="approval-you">You</span>}</span>;
}
