# Security

Open Brain holds the rules your agents follow and, if you use connections, the
credentials they're handed. A bug here can matter, so please report it
privately.

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/Fllenorium/open-brain/security/advisories/new).
Don't open a public issue. Say what you found, how to reproduce it, and what
someone could do with it.

Especially worth reporting:

- A query that returns or changes another owner's rows.
- Any way for an agent to read or change its own bindings, grants, or write
  policy, or to read a credential through a tool.
- Anything that writes into an entry without a pending proposal.
- A way around the owner key or the agent bearer tokens.
- A credential that can be recovered without `OPENBRAIN_MASTER_KEY`.

## Running it safely

- Set `OPENBRAIN_OWNER_KEY` to at least 24 random characters
  (`openssl rand -base64 24`). Holding it is the whole of sign-in.
- Keep a copy of `OPENBRAIN_MASTER_KEY` somewhere that isn't the deployment.
  Without it, stored credentials are unreadable by design.
- Put it behind HTTPS. Agent tokens and the owner cookie travel on every
  request.
- Revoke an agent's token from its page the moment you stop trusting it. The
  next call it makes gets a 401.
