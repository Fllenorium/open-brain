## What this changes

<!-- One or two sentences. What someone using Open Brain will notice. -->

## How you checked it

<!-- What you ran. If you didn't run something, say so. -->

- [ ] `./scripts/check-all.sh` passes
- [ ] Every new query filters on `user_id`
- [ ] Every new mutation writes an `activity` row
- [ ] Nothing an agent or the AI features write lands without a proposal
- [ ] No new MCP tool reads bindings, grants, policy, or a credential
