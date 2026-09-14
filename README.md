# HQuinn hosted CMD EFS copilot

The Flask app runs the full conversational CMD EFS copilot interface on Render. A connector on the laptop claims queued turns over outbound HTTPS, sends them to the existing local Codex intelligence service, and returns the structured response to the same browser conversation.

The hosted interface supports persistent browser-side chat history, qualifying questions, progressive primary/supporting/tertiary configuration, Q/R/O selection controls, working baselines, visible conflict gates, package candidates, alternatives, validation gates, source evidence, change history, undo, and Excel configuration export. Required items are locked, recommended items begin selected but can be removed, and applicable optional items are displayed unchecked for explicit selection. Its desktop layout uses a collapsible configuration rail and a 40:60 conversation-to-solution split. Static hosted assets contain no embedded CMD configuration corpus; source files, retrieval indexes, and Codex credentials remain on the laptop.

The Excel export is generated in the browser. Its first worksheet consolidates the full build with available SKUs or part numbers, quantities, statuses, rationale, and sources; Context, Validation, Evidence, and Chat History worksheets retain the supporting record.

The copilot treats incomplete customer information as normal. It provides one best-supported working build with clearly labeled assumptions, asks only the highest-impact next question, limits secondary routes to one credible alternative, and suppresses package candidates unless the evidence establishes a strong requirement fit.

## Render configuration

Create a Python web service from this repository.

- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn --workers 1 --threads 8 --timeout 300 --bind 0.0.0.0:$PORT app:app`
- Health check: `/healthz`

Configure these secrets in Render; never commit their values:

- `APP_USERNAME`: demo username
- `APP_PASSWORD`: at least 10 characters
- `FLASK_SECRET_KEY`: at least 32 random characters
- `BRIDGE_TOKEN`: at least 32 random characters

## Start the live prototype

1. Open the deployed Render URL and sign in.
2. Run `local_bridge/start_bridge.cmd`.
3. Paste the Render URL and the same `BRIDGE_TOKEN` configured in Render.
4. Choose live local-intelligence mode only for approved, non-confidential prototype testing.
5. When the page reports that the laptop is connected, start or continue a consultation.

The retained `/relay-test` route provides the earlier transport diagnostic page. Connection-only mode returns a harmless local echo and does not invoke private knowledge or an AI service. Live mode invokes the existing local intelligence service at `http://127.0.0.1:8765`.

## Prototype limitations

- Queued jobs are held in memory and are lost during a Render restart or deploy.
- One Gunicorn process is required because this demonstration uses an in-memory queue.
- The laptop and bridge must remain running for AI requests to complete.
- All live Codex requests use the ChatGPT/Codex identity signed in on the laptop.
- Conversation and workspace history are stored in the current browser. They are not a shared system of record.
- Each browser tab must acknowledge the live-data boundary before its first request.
- This is not a production deployment or a released quoting system.

