import { useState } from "react";
import "../styles/blueprint.css";
import { BlueprintProvider } from "./BlueprintData.jsx";
import CommandPalette from "./CommandPalette.jsx";
import Hero from "./Hero.jsx";
import Pillars from "./Pillars.jsx";
import TopologyMap from "./TopologyMap.jsx";
import Decisions from "./Decisions.jsx";
import Modules from "./Modules.jsx";
import Roles from "./Roles.jsx";
import Rbac from "./Rbac.jsx";
import Flows from "./Flows.jsx";
import Conclusion from "./Conclusion.jsx";

// Dirender di dalam dashboard Superadmin; data dari Supabase.
export default function BlueprintDoc({ doc }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusNode, setFocusNode] = useState(null);
  const [focusRole, setFocusRole] = useState(null);
  return (
    <BlueprintProvider doc={doc}>
      <div className="bp">
        <CommandPalette
          open={paletteOpen}
          onOpen={() => setPaletteOpen(true)}
          onClose={() => setPaletteOpen(false)}
          onPickNode={setFocusNode}
          onPickRole={setFocusRole}
        />
        <Hero />
        <Pillars />
        <TopologyMap focusNode={focusNode} />
        <Decisions />
        <Modules />
        <Roles focusRole={focusRole} />
        <Rbac />
        <Flows />
        <Conclusion />
      </div>
    </BlueprintProvider>
  );
}
