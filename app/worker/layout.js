import WorkerProfileReminder from "./WorkerProfileReminder";
import "./worker-ui.css";

export default function WorkerLayout({ children }) {
  return <div className="worker-ui"><WorkerProfileReminder />{children}</div>;
}
