<!-- This repository has an automated AI reviewer called `upsun-dispatch` on github.
When creating a PR, it should be `open` and not `draft`.
Wait for Dispatch to post their review (usually between 5 and 10 minutes) and then analyze it and make the necessary changes and update the PR. Resolve the inline comments opened by Dispatch. Never do more than 2 run of changes. -->

We have an AI reviewer in place on github but you can forget about it for now.
Open PR once the work on an issue is done. Wait for my command to merge it.

Run react-doctor before committing React code.
Use agent-browser to test frontend changes.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
