import WorkerProfileReminder from "./WorkerProfileReminder";
import WorkerConnectionPanel from "../components/WorkerDirectoryClient";
import "./worker-ui.css";

export default function WorkerLayout({ children }) {
  return <div className="worker-ui"><WorkerProfileReminder /><WorkerConnectionPanel compact reviewOnly />{children}</div>;
}
