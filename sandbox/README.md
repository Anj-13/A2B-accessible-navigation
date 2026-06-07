# NemoClaw Sandbox Integration

The sandbox planner now delegates route selection to the Node route engine and
uses OpenClaw only to phrase the deterministic result conversationally.

## Services

On the ZGX host, start the route API:

```bash
HOST=0.0.0.0 npm start
```

Inside the NemoClaw sandbox, set the host URL that its network policy permits:

```bash
export ROUTE_API_BASE_URL=http://<ZGX_HOST_IP>:3000
```

Then run:

```bash
./run_agent.sh
```

The planner writes clean output to `data/recommendation.json` and conversation
events to `memory.json`.

## Optional Paths

These variables make the same files usable outside `/sandbox`:

```text
SANDBOX_DIR
SANDBOX_DATA_DIR
SANDBOX_MEMORY_FILE
ROUTE_API_BASE_URL
ROUTE_API_TIMEOUT_SECONDS
OPENCLAW_COMMAND
```

The NemoClaw network policy must allow the configured route API host and port.
