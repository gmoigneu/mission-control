import type { Ext } from "cytoscape";

let fcoseRegistered = false;

export async function loadGraphEngine() {
  const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
    import("cytoscape"),
    import("cytoscape-fcose"),
  ]);

  if (!fcoseRegistered) {
    cytoscape.use(fcose as Ext);
    fcoseRegistered = true;
  }

  return cytoscape;
}
