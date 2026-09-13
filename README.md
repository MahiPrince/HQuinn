# HQuinn hosted-to-local relay demo

This is a deliberately small proof of concept. The Flask app runs on Render, while a connector on the laptop claims queued jobs over outbound HTTPS. Connection-only mode returns a harmless local echo and never invokes private knowledge or an AI service.

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

## First safe test

1. Open the deployed Render URL and sign in.
2. Run `local_bridge/start_bridge.cmd`.
3. Paste the Render URL and the same `BRIDGE_TOKEN` configured in Render.
4. Choose mode `1` for the connection-only test.
5. When the page reports that the laptop is connected, select **Run relay test**.

Mode `2` invokes an existing local intelligence service at `http://127.0.0.1:8765`. Use it only after the connection-only test passes and organizational approval permits prompts and results to transit Render.

## Prototype limitations

- Queued jobs are held in memory and are lost during a Render restart or deploy.
- One Gunicorn process is required because this demonstration uses an in-memory queue.
- The laptop and bridge must remain running for AI requests to complete.
- All live Codex requests use the ChatGPT/Codex identity signed in on the laptop.
- This is not a production deployment or a released quoting system.

