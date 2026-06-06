// cytoscape-fcose ships no TypeScript types; it's a Cytoscape layout extension
// registered via cytoscape.use(fcose).
// Fallback: cytoscape.Ext is a namespace-member, not a named export, so we use unknown.
declare module "cytoscape-fcose" {
  const ext: unknown;
  export default ext;
}
