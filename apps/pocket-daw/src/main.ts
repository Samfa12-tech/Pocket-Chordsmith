import "./styles/base.css";
import "./styles/timeline.css";
import "./styles/mixer.css";
import { App } from "./app/App";

const root = document.getElementById("app");
if (!root) throw new Error("Pocket DAW root element not found.");

new App(root).start();
