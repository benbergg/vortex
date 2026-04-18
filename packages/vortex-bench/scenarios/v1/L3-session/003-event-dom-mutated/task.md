You need to subscribe to DOM mutation events and verify they fire.

1. Call `vortex_events_subscribe` with `types=["dom.mutated"]` and `minLevel="info"` to start receiving mutation events.
2. Call `vortex_dom_watch_mutations` on the active tab to activate mutation reporting.
3. Navigate the active tab to `{{FIXTURE_URL}}/smoke/basic-click` and click the Submit button. This will modify the DOM (changing the status text and URL).
4. Check subsequent tool responses for a `[vortex-events]` entry — it confirms mutation events were piggybacked.
5. In your final text, state whether at least one `dom.mutated` event was observed.

Stop when done.
